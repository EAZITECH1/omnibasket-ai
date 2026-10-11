import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Production-Safe Encrypted Session Store for Binance Agentic Wallet
 * Uses AES-256-GCM with per-session random 12-byte IV and authentication tag.
 *
 * Storage backends (selected by environment variable):
 *   - Redis  : BAW_SESSION_REDIS_URL (or Railway's injected REDIS_URL). Native TTL expiry,
 *              shared across instances, survives restarts and redeploys.
 *   - File   : BAW_SESSION_STORE_DIR (absolute path on a persistent volume), or a local
 *              directory in development/test only.
 * Redis takes precedence when configured. In production one of the two is mandatory,
 * together with a stable BAW_SESSION_SECRET. Anything else fails closed.
 */

const DEFAULT_DEV_STORE_DIR = path.join(process.cwd(), '.baw_sessions');
const REDIS_KEY_PREFIX = 'baw:session:';
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isPlaceholderSecret(secret) {
  const lower = secret.toLowerCase();
  return (
    lower.includes('placeholder') ||
    lower.includes('change_me') ||
    lower.includes('your_secret_here') ||
    lower.includes('secret_key_here')
  );
}

function resolveRedisUrl(env) {
  const raw = (env.BAW_SESSION_REDIS_URL || env.REDIS_URL || '').trim();
  return raw || null;
}

/**
 * Validates session store configuration.
 * Production (NODE_ENV === 'production') requires:
 *   1. A shared store: BAW_SESSION_REDIS_URL / REDIS_URL, or an absolute BAW_SESSION_STORE_DIR
 *      that is external to the app checkout (persistent volume).
 *   2. A stable high-entropy BAW_SESSION_SECRET (>= 32 chars, non-placeholder).
 * Development/test permit a local directory and a fallback key.
 */
export function validateStoreConfig(customEnv = null) {
  const env = customEnv || process.env;
  const isProd = env.NODE_ENV === 'production';
  const rawDir = env.BAW_SESSION_STORE_DIR ? env.BAW_SESSION_STORE_DIR.trim() : null;
  const rawSecret = env.BAW_SESSION_SECRET ? env.BAW_SESSION_SECRET.trim() : null;
  const redisUrl = resolveRedisUrl(env);

  if (redisUrl && !/^rediss?:\/\//i.test(redisUrl)) {
    return {
      valid: false,
      isProduction: isProd,
      reason: 'REDIS_URL_INVALID',
      error: 'BAW_SESSION_REDIS_URL must start with redis:// or rediss://.'
    };
  }

  if (isProd) {
    if (!redisUrl) {
      if (!rawDir) {
        return {
          valid: false,
          isProduction: true,
          reason: 'STORE_DIR_MISSING',
          error: 'Production requires a shared session store: set BAW_SESSION_REDIS_URL (Redis) or BAW_SESSION_STORE_DIR (persistent volume, e.g. /data/baw_sessions).'
        };
      }

      if (!path.isAbsolute(rawDir)) {
        return {
          valid: false,
          isProduction: true,
          reason: 'STORE_DIR_NOT_ABSOLUTE',
          error: 'BAW_SESSION_STORE_DIR must be an absolute path to an attached persistent volume.'
        };
      }

      const resolvedDir = path.resolve(rawDir);
      const resolvedCwd = path.resolve(process.cwd());
      if (resolvedDir === resolvedCwd || resolvedDir.startsWith(resolvedCwd + path.sep)) {
        return {
          valid: false,
          isProduction: true,
          reason: 'STORE_DIR_INSIDE_APP_CHECKOUT',
          error: 'BAW_SESSION_STORE_DIR must point to an external persistent volume mount, not inside the ephemeral application checkout.'
        };
      }
    }

    if (!rawSecret || rawSecret.length < 32) {
      return {
        valid: false,
        isProduction: true,
        reason: 'SESSION_SECRET_INVALID',
        error: 'Production requires a high-entropy BAW_SESSION_SECRET of at least 32 characters.'
      };
    }

    if (isPlaceholderSecret(rawSecret)) {
      return {
        valid: false,
        isProduction: true,
        reason: 'SESSION_SECRET_PLACEHOLDER',
        error: 'BAW_SESSION_SECRET cannot be a placeholder in production.'
      };
    }

    if (redisUrl) {
      return {
        valid: true,
        isProduction: true,
        backend: 'redis',
        redisUrl,
        secretConfigured: true
      };
    }

    return {
      valid: true,
      isProduction: true,
      backend: 'file',
      storeDir: path.resolve(rawDir),
      secretConfigured: true
    };
  }

  // Development & Test environments
  if (redisUrl) {
    return {
      valid: true,
      isProduction: false,
      backend: 'redis',
      redisUrl,
      secretConfigured: Boolean(rawSecret)
    };
  }

  const devDir = rawDir ? path.resolve(rawDir) : DEFAULT_DEV_STORE_DIR;
  return {
    valid: true,
    isProduction: false,
    backend: 'file',
    storeDir: devDir,
    secretConfigured: Boolean(rawSecret)
  };
}

/**
 * Get configured store directory or throw in production if unconfigured
 */
export function getStoreDir(customEnv = null) {
  const config = validateStoreConfig(customEnv);
  if (!config.valid) {
    throw new Error(`Session store unconfigured: ${config.error}`);
  }
  if (!config.storeDir) {
    throw new Error('Session store is not file-backed in this configuration.');
  }
  return config.storeDir;
}

/**
 * Derive or retrieve master 32-byte AES-256 encryption key
 */
export function getMasterEncryptionKey(customSecret = null, customEnv = null) {
  const env = customEnv || process.env;
  const isProd = env.NODE_ENV === 'production';
  const secret = (customSecret || env.BAW_SESSION_SECRET || '').trim();

  if (secret) {
    if (isProd && secret.length < 32) {
      throw new Error('Production requires a high-entropy BAW_SESSION_SECRET of at least 32 characters.');
    }
    return crypto.scryptSync(secret, 'omnibasket-baw-salt-2026', 32);
  }

  if (isProd) {
    throw new Error('Production requires an explicit BAW_SESSION_SECRET. Ephemeral key generation is strictly forbidden in production.');
  }

  // Development/Test fallback only (file-backed key next to the dev session directory)
  const storeDir = validateStoreConfig(env).storeDir || DEFAULT_DEV_STORE_DIR;
  const keyPath = path.join(storeDir, '.master.key');

  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(keyPath)) {
    try {
      const keyHex = fs.readFileSync(keyPath, 'utf8').trim();
      if (keyHex.length === 64) {
        return Buffer.from(keyHex, 'hex');
      }
    } catch (_) {}
  }

  const freshKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyPath, freshKey.toString('hex'), { mode: 0o600 });
  } catch (_) {}
  return freshKey;
}

/**
 * Deterministic hash of session ID for safe storage key / filename
 */
function sessionHash(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Valid sessionId string required for session store');
  }
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

/**
 * Encrypt arbitrary JSON-serializable session data
 */
function encryptSessionData(data, masterKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

  // Ensure sensitive signing secrets or seed phrases are never persisted
  const sanitised = { ...data };
  delete sanitised.privateKey;
  delete sanitised.seedPhrase;
  if (sanitised.keyPair) {
    delete sanitised.keyPair.privateKey;
  }

  const plaintext = JSON.stringify(sanitised);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: 1,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: ciphertext,
    updatedAt: Date.now()
  });
}

/**
 * Decrypt session data and verify authentication tag
 */
function decryptSessionData(encryptedJson, masterKey) {
  try {
    const parsed = JSON.parse(encryptedJson);
    if (!parsed || parsed.v !== 1 || !parsed.iv || !parsed.tag || !parsed.data) {
      return null;
    }

    const iv = Buffer.from(parsed.iv, 'hex');
    const tag = Buffer.from(parsed.tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (_) {
    return null;
  }
}

/**
 * Time-to-live for a session, derived from its expiresAt (bounded), in milliseconds
 */
function ttlForSession(sessionData) {
  const now = Date.now();
  const expiresAt = Number(sessionData?.expiresAt);
  const ttl = Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt - now : DEFAULT_SESSION_TTL_MS;
  return Math.min(Math.max(ttl, 1000), MAX_SESSION_TTL_MS);
}

// ----------------------------------------------------------------------------
// Storage backends. Each stores an opaque (already encrypted) string by hashed key.
//   { name, get(hash), set(hash, value, ttlMs), del(hash), clear() }
// ----------------------------------------------------------------------------

function createFileBackend(dir) {
  const storeDir = path.resolve(dir);
  const fileFor = (hash) => path.join(storeDir, `${hash}.enc`);

  return {
    name: 'file',
    async get(hash) {
      const target = fileFor(hash);
      if (!fs.existsSync(target)) return null;
      return fs.readFileSync(target, 'utf8');
    },
    async set(hash, value) {
      if (!fs.existsSync(storeDir)) {
        fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 });
      }
      const target = fileFor(hash);
      const tempFile = `${target}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(tempFile, value, { mode: 0o600 });
        fs.renameSync(tempFile, target);
      } catch (err) {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
        throw err;
      }
    },
    async del(hash) {
      const target = fileFor(hash);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    },
    async clear() {
      if (!fs.existsSync(storeDir)) return;
      for (const file of fs.readdirSync(storeDir)) {
        if (file.endsWith('.enc') || file.endsWith('.tmp')) {
          try { fs.unlinkSync(path.join(storeDir, file)); } catch (_) {}
        }
      }
    }
  };
}

/**
 * Redis backend. `client` must provide get / set(key, value, 'PX', ms) / del / scan.
 * Native TTL (PX) removes expired sessions server-side.
 */
export function createRedisBackend(client) {
  return {
    name: 'redis',
    async get(hash) {
      const value = await client.get(`${REDIS_KEY_PREFIX}${hash}`);
      return value === undefined ? null : value;
    },
    async set(hash, value, ttlMs) {
      await client.set(`${REDIS_KEY_PREFIX}${hash}`, value, 'PX', Math.max(1, Math.floor(ttlMs)));
    },
    async del(hash) {
      await client.del(`${REDIS_KEY_PREFIX}${hash}`);
    },
    async clear() {
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', `${REDIS_KEY_PREFIX}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length) await client.del(...keys);
      } while (cursor !== '0');
    }
  };
}

let sharedRedisClient = null;
let sharedRedisUrl = null;
let injectedBackend = null;

async function getRedisBackendForUrl(url) {
  if (!sharedRedisClient || sharedRedisUrl !== url) {
    if (sharedRedisClient) {
      try { sharedRedisClient.disconnect(); } catch (_) {}
    }
    const { default: Redis } = await import('ioredis');
    sharedRedisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000
    });
    sharedRedisClient.on('error', () => {});
    sharedRedisUrl = url;
  }
  return createRedisBackend(sharedRedisClient);
}

/**
 * Inject a backend (tests only). Pass null to restore environment-based selection.
 */
export function setSessionBackendForTesting(backend) {
  injectedBackend = backend || null;
}

/**
 * Close the shared Redis connection (graceful shutdown / tests)
 */
export async function closeSessionStore() {
  if (sharedRedisClient) {
    try { await sharedRedisClient.quit(); } catch (_) { try { sharedRedisClient.disconnect(); } catch (__) {} }
    sharedRedisClient = null;
    sharedRedisUrl = null;
  }
}

/**
 * Resolve the active backend. An explicit directory argument always selects the file backend.
 * Returns null when production configuration is invalid (callers fail closed).
 */
async function resolveBackend(customDir) {
  if (customDir) return createFileBackend(customDir);
  if (injectedBackend) return injectedBackend;

  const config = validateStoreConfig();
  if (!config.valid) return null;
  if (config.backend === 'redis') return getRedisBackendForUrl(config.redisUrl);
  return createFileBackend(config.storeDir);
}

function deriveKey(customSecret) {
  return customSecret
    ? crypto.scryptSync(customSecret, 'omnibasket-baw-salt-2026', 32)
    : getMasterEncryptionKey();
}

/**
 * Save session data (encrypted) with the backend's atomic/TTL semantics
 */
export async function saveSession(sessionId, sessionData, customDir = null, customSecret = null) {
  if (!sessionId || !sessionData) return false;

  try {
    const backend = await resolveBackend(customDir);
    if (!backend) return false;

    const masterKey = deriveKey(customSecret);
    const encryptedPayload = encryptSessionData(sessionData, masterKey);
    await backend.set(sessionHash(sessionId), encryptedPayload, ttlForSession(sessionData));
    return true;
  } catch (err) {
    console.error(`[bawSessionStore] Failed to save session:`, err.message);
    return false;
  }
}

/**
 * Load and decrypt session by session ID
 */
export async function loadSession(sessionId, customDir = null, customSecret = null) {
  if (!sessionId) return null;

  try {
    const backend = await resolveBackend(customDir);
    if (!backend) return null;

    const hash = sessionHash(sessionId);
    const raw = await backend.get(hash);
    if (!raw) return null;

    const decrypted = decryptSessionData(raw, deriveKey(customSecret));

    if (!decrypted) {
      // Wrong key, corrupt or tampered payload: reject. Remove only genuinely unreadable
      // payloads (invalid structure); never delete on a mere key mismatch of a valid payload.
      let structurallyValid = false;
      try {
        const p = JSON.parse(raw);
        structurallyValid = Boolean(p && p.v === 1 && /^[0-9a-f]{24}$/.test(p.iv || '') && /^[0-9a-f]{32}$/.test(p.tag || ''));
      } catch (_) {}
      if (!structurallyValid) {
        try { await backend.del(hash); } catch (_) {}
      }
      return null;
    }

    // Application-level expiration check (defence in depth alongside native TTL)
    if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
      try { await backend.del(hash); } catch (_) {}
      return null;
    }

    return decrypted;
  } catch (_) {
    return null;
  }
}

/**
 * Securely delete session
 */
export async function deleteSession(sessionId, customDir = null) {
  if (!sessionId) return true;

  try {
    const backend = await resolveBackend(customDir);
    if (!backend) return false;
    await backend.del(sessionHash(sessionId));
    return true;
  } catch (err) {
    console.error(`[bawSessionStore] Failed to delete session:`, err.message);
    return false;
  }
}

/**
 * Rotate session ID after privilege/authentication state change (Session Fixation Prevention)
 */
export async function rotateSession(oldSessionId, customDir = null, customSecret = null) {
  if (!oldSessionId) return null;
  const existing = await loadSession(oldSessionId, customDir, customSecret);
  if (!existing) return null;

  const newSessionId = crypto.randomUUID();
  existing.sessionId = newSessionId;
  existing.rotatedAt = Date.now();

  const saved = await saveSession(newSessionId, existing, customDir, customSecret);
  if (!saved) return null;

  await deleteSession(oldSessionId, customDir);
  return { newSessionId, session: existing };
}

/**
 * Wipe all sessions (Used for test suite teardown)
 */
export async function clearAllSessions(customDir = null) {
  try {
    if (customDir) {
      await createFileBackend(customDir).clear();
      return;
    }
    if (injectedBackend) {
      await injectedBackend.clear();
      return;
    }
    const config = validateStoreConfig();
    if (config.backend === 'redis') return; // never mass-delete a shared Redis outside tests
    await createFileBackend(config.storeDir || DEFAULT_DEV_STORE_DIR).clear();
  } catch (_) {}
}
