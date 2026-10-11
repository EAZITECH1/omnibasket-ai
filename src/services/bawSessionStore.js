import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Production-Safe Encrypted Session Store for Binance Agentic Wallet
 * Uses AES-256-GCM with per-session random 12-byte IV and authentication tag.
 * Sessions persist durably across server restarts, worker reboots, and multi-process deployments.
 */

const DEFAULT_DEV_STORE_DIR = path.join(process.cwd(), '.baw_sessions');

/**
 * Validates session store configuration.
 * In production (NODE_ENV === 'production'):
 *   1. Explicit persistent volume directory via BAW_SESSION_STORE_DIR (must be absolute, external to checkout).
 *   2. Explicit high-entropy BAW_SESSION_SECRET (minimum 32 characters, non-placeholder).
 * In development / testing:
 *   Permits local directory with fallback secret / dev key.
 */
export function validateStoreConfig(customEnv = null) {
  const env = customEnv || process.env;
  const isProd = env.NODE_ENV === 'production';
  const rawDir = env.BAW_SESSION_STORE_DIR ? env.BAW_SESSION_STORE_DIR.trim() : null;
  const rawSecret = env.BAW_SESSION_SECRET ? env.BAW_SESSION_SECRET.trim() : null;

  if (isProd) {
    if (!rawDir) {
      return {
        valid: false,
        isProduction: true,
        reason: 'STORE_DIR_MISSING',
        error: 'Production requires an explicit persistent shared volume directory configured via BAW_SESSION_STORE_DIR (e.g. /data/baw_sessions).'
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

    if (!rawSecret || rawSecret.length < 32) {
      return {
        valid: false,
        isProduction: true,
        reason: 'SESSION_SECRET_INVALID',
        error: 'Production requires a high-entropy BAW_SESSION_SECRET of at least 32 characters.'
      };
    }

    const lowerSecret = rawSecret.toLowerCase();
    if (
      lowerSecret.includes('placeholder') || 
      lowerSecret.includes('change_me') || 
      lowerSecret.includes('your_secret_here') ||
      lowerSecret.includes('secret_key_here')
    ) {
      return {
        valid: false,
        isProduction: true,
        reason: 'SESSION_SECRET_PLACEHOLDER',
        error: 'BAW_SESSION_SECRET cannot be a placeholder in production.'
      };
    }

    return {
      valid: true,
      isProduction: true,
      storeDir: resolvedDir,
      secretConfigured: true
    };
  }

  // Development & Test environments
  const devDir = rawDir ? path.resolve(rawDir) : DEFAULT_DEV_STORE_DIR;
  return {
    valid: true,
    isProduction: false,
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

  // Development/Test fallback only
  const storeDir = getStoreDir(env);
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
 * Deterministic hash of session ID for safe filesystem filename
 */
function sessionFilename(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Valid sessionId string required for session store');
  }
  const hash = crypto.createHash('sha256').update(sessionId).digest('hex');
  return `${hash}.enc`;
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
 * Save session data durably with atomic write
 */
export async function saveSession(sessionId, sessionData, customDir = null, customSecret = null) {
  if (!sessionId || !sessionData) return false;

  const config = validateStoreConfig();
  if (!config.valid && !customDir) return false;

  const storeDir = customDir ? path.resolve(customDir) : config.storeDir;

  if (!fs.existsSync(storeDir)) {
    try {
      fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 });
    } catch (_) {
      return false;
    }
  }

  let masterKey;
  try {
    masterKey = customSecret 
      ? crypto.scryptSync(customSecret, 'omnibasket-baw-salt-2026', 32)
      : getMasterEncryptionKey();
  } catch (_) {
    return false;
  }

  const encryptedPayload = encryptSessionData(sessionData, masterKey);
  const targetFile = path.join(storeDir, sessionFilename(sessionId));
  const tempFile = `${targetFile}.${crypto.randomUUID()}.tmp`;

  try {
    fs.writeFileSync(tempFile, encryptedPayload, { mode: 0o600 });
    fs.renameSync(tempFile, targetFile);
    return true;
  } catch (err) {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    console.error(`[bawSessionStore] Failed to save session ${sessionId}:`, err.message);
    return false;
  }
}

/**
 * Load and decrypt session by session ID
 */
export async function loadSession(sessionId, customDir = null, customSecret = null) {
  if (!sessionId) return null;

  const config = validateStoreConfig();
  if (!config.valid && !customDir) return null;

  const storeDir = customDir ? path.resolve(customDir) : config.storeDir;
  const targetFile = path.join(storeDir, sessionFilename(sessionId));

  if (!fs.existsSync(targetFile)) {
    return null;
  }

  try {
    const masterKey = customSecret 
      ? crypto.scryptSync(customSecret, 'omnibasket-baw-salt-2026', 32)
      : getMasterEncryptionKey();
    const raw = fs.readFileSync(targetFile, 'utf8');
    const decrypted = decryptSessionData(raw, masterKey);

    if (!decrypted) {
      // Corrupt or tampered session file
      try { fs.unlinkSync(targetFile); } catch (_) {}
      return null;
    }

    // Check expiration
    if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
      try { fs.unlinkSync(targetFile); } catch (_) {}
      return null;
    }

    return decrypted;
  } catch (err) {
    return null;
  }
}

/**
 * Securely delete session
 */
export async function deleteSession(sessionId, customDir = null) {
  if (!sessionId) return true;

  const config = validateStoreConfig();
  if (!config.valid && !customDir) return false;

  const storeDir = customDir ? path.resolve(customDir) : config.storeDir;
  const targetFile = path.join(storeDir, sessionFilename(sessionId));

  try {
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }
    return true;
  } catch (err) {
    console.error(`[bawSessionStore] Failed to delete session ${sessionId}:`, err.message);
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
  const storeDir = customDir ? path.resolve(customDir) : (validateStoreConfig().storeDir || DEFAULT_DEV_STORE_DIR);
  if (fs.existsSync(storeDir)) {
    const files = fs.readdirSync(storeDir);
    for (const file of files) {
      if (file.endsWith('.enc') || file.endsWith('.tmp')) {
        try { fs.unlinkSync(path.join(storeDir, file)); } catch (_) {}
      }
    }
  }
}
