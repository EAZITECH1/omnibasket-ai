import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Production-Safe Encrypted Session Store for Binance Agentic Wallet
 * Uses AES-256-GCM with per-session random 12-byte IV and authentication tag.
 * Sessions persist durably across server restarts, worker reboots, and multi-process deployments.
 */

const DEFAULT_STORE_DIR = path.join(process.cwd(), '.baw_sessions');

function getStoreDir() {
  return process.env.BAW_SESSION_STORE_DIR || DEFAULT_STORE_DIR;
}

/**
 * Derive or retrieve master 32-byte AES-256 encryption key
 */
function getMasterEncryptionKey() {
  // 1. Explicit secret from environment
  if (process.env.BAW_SESSION_SECRET && process.env.BAW_SESSION_SECRET.trim()) {
    return crypto.scryptSync(process.env.BAW_SESSION_SECRET.trim(), 'omnibasket-baw-salt-2026', 32);
  }

  // 2. Persisted local key file in store directory
  const storeDir = getStoreDir();
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

  // Generate fresh 32-byte key
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
  } catch (err) {
    return null;
  }
}

/**
 * Save session data durably with atomic write
 */
export async function saveSession(sessionId, sessionData) {
  if (!sessionId || !sessionData) return false;
  const storeDir = getStoreDir();

  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  }

  const masterKey = getMasterEncryptionKey();
  const encryptedPayload = encryptSessionData(sessionData, masterKey);
  const targetFile = path.join(storeDir, sessionFilename(sessionId));
  const tempFile = `${targetFile}.${crypto.randomBytes(4).toString('hex')}.tmp`;

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
export async function loadSession(sessionId) {
  if (!sessionId) return null;
  const storeDir = getStoreDir();
  const targetFile = path.join(storeDir, sessionFilename(sessionId));

  if (!fs.existsSync(targetFile)) {
    return null;
  }

  try {
    const masterKey = getMasterEncryptionKey();
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
    console.error(`[bawSessionStore] Failed to load session ${sessionId}:`, err.message);
    return null;
  }
}

/**
 * Securely delete session
 */
export async function deleteSession(sessionId) {
  if (!sessionId) return true;
  const storeDir = getStoreDir();
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
export async function rotateSession(oldSessionId) {
  if (!oldSessionId) return null;
  const existing = await loadSession(oldSessionId);
  if (!existing) return null;

  const newSessionId = crypto.randomUUID();
  existing.sessionId = newSessionId;
  existing.rotatedAt = Date.now();

  const saved = await saveSession(newSessionId, existing);
  if (!saved) return null;

  await deleteSession(oldSessionId);
  return { newSessionId, session: existing };
}

/**
 * Wipe all sessions (Used for test suite teardown)
 */
export async function clearAllSessions() {
  const storeDir = getStoreDir();
  if (fs.existsSync(storeDir)) {
    const files = fs.readdirSync(storeDir);
    for (const file of files) {
      if (file.endsWith('.enc') || file.endsWith('.tmp')) {
        try { fs.unlinkSync(path.join(storeDir, file)); } catch (_) {}
      }
    }
  }
}
