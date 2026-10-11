import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import util from 'util';

const execFilePromise = util.promisify(execFile);

export function isAgenticWalletEnabled() {
  return process.env.ENABLE_AGENTIC_WALLET === 'true';
}

export function ensureBawSession() {
  if (!isAgenticWalletEnabled()) {
    throw new Error('Agentic Wallet is disabled in public mode. Shared server-side wallet execution is blocked.');
  }

  const bawDir = process.env.BINANCE_BAW_DIR || path.join(os.homedir(), '.baw');
  const sessionPath = path.join(bawDir, 'session.json');

  if (process.env.BINANCE_BAW_SESSION_JSON) {
    try {
      let raw = process.env.BINANCE_BAW_SESSION_JSON.trim();
      if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        try {
          raw = JSON.parse(raw);
        } catch (_) {
          raw = raw.slice(1, -1).trim();
        }
      }

      if (!fs.existsSync(bawDir)) {
        fs.mkdirSync(bawDir, { recursive: true });
      }

      if (!fs.existsSync(sessionPath) || fs.statSync(sessionPath).size === 0) {
        fs.writeFileSync(sessionPath, typeof raw === 'string' ? raw : JSON.stringify(raw), 'utf8');
      }
    } catch (err) {
      console.warn('Failed to restore baw session from env:', err.message);
    }
  }
}

/**
 * Reads ~/.baw/session.json metadata without exposing secrets
 */
export function getBawSessionInfo() {
  const enabled = isAgenticWalletEnabled();
  if (!enabled) {
    return {
      enabled: false,
      exists: false,
      hasClientId: false,
      message: 'Agentic Wallet disabled in public mode'
    };
  }

  ensureBawSession();
  const bawDir = process.env.BINANCE_BAW_DIR || path.join(os.homedir(), '.baw');
  const sessionPath = path.join(bawDir, 'session.json');

  const info = {
    enabled: true,
    exists: false,
    hasClientId: false,
    sessionDir: bawDir,
    clientIdSnippet: null
  };

  try {
    if (fs.existsSync(sessionPath)) {
      info.exists = true;
      const content = fs.readFileSync(sessionPath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.clientId) {
        info.hasClientId = true;
        const cid = String(parsed.clientId);
        info.clientIdSnippet = cid.length > 12 ? `${cid.slice(0, 6)}...${cid.slice(-4)}` : 'configured';
      }
    }
  } catch (err) {
    info.error = err.message;
  }

  return info;
}

/**
 * Query live agent wallet authentication status via baw CLI
 */
export async function getAgenticWalletStatus() {
  if (!isAgenticWalletEnabled()) {
    return {
      success: true,
      data: { status: 'UNAVAILABLE' }
    };
  }

  ensureBawSession();
  try {
    const { stdout } = await execFilePromise('baw', ['wallet', 'status', '--json']);
    const parsed = JSON.parse(stdout);
    return {
      success: true,
      data: parsed.data || parsed
    };
  } catch (err) {
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout);
        return {
          success: false,
          error: parsed.error || { message: err.message },
          data: parsed.data || null
        };
      } catch (_) {}
    }
    return {
      success: false,
      error: { message: err.message }
    };
  }
}

/**
 * Query wallet address via baw CLI
 */
export async function getAgenticWalletAddress() {
  if (!isAgenticWalletEnabled()) {
    return { success: false, error: { message: 'Agentic Wallet disabled' } };
  }

  ensureBawSession();
  try {
    const { stdout } = await execFilePromise('baw', ['wallet', 'address', '--json']);
    const parsed = JSON.parse(stdout);
    if (parsed.success && parsed.data) {
      return {
        success: true,
        addresses: parsed.data.addresses || parsed.data
      };
    }
    return { success: false, error: parsed.error };
  } catch (err) {
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout);
        return { success: false, error: parsed.error };
      } catch (_) {}
    }
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Query daily trading limit & remaining quota via baw CLI
 */
export async function getAgenticWalletQuota() {
  if (!isAgenticWalletEnabled()) {
    return { success: false, error: { message: 'Agentic Wallet disabled' } };
  }

  ensureBawSession();
  try {
    const { stdout } = await execFilePromise('baw', ['wallet', 'left-quota', '--json']);
    const parsed = JSON.parse(stdout);
    return {
      success: true,
      data: parsed.data || parsed
    };
  } catch (err) {
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout);
        return { success: false, error: parsed.error };
      } catch (_) {}
    }
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Start login flow by generating a pairing QR code via baw auth signin
 */
export async function startBawSignin() {
  if (!isAgenticWalletEnabled()) {
    return { success: false, error: { message: 'Agentic Wallet disabled in public mode' } };
  }

  ensureBawSession();
  try {
    const { stdout } = await execFilePromise('baw', ['auth', 'signin', '--json']);
    const parsed = JSON.parse(stdout);
    return parsed;
  } catch (err) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch (_) {}
    }
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Verify QR code login flow status
 */
export async function verifyBawSignin(qrCodeId) {
  if (!isAgenticWalletEnabled()) {
    return { success: false, error: { message: 'Agentic Wallet disabled in public mode' } };
  }
  if (!qrCodeId || typeof qrCodeId !== 'string') {
    throw new Error('Valid qrCodeId required for verification');
  }
  ensureBawSession();
  try {
    const { stdout } = await execFilePromise('baw', ['auth', 'verify', '--qrCodeId', qrCodeId, '--json']);
    const parsed = JSON.parse(stdout);
    return parsed;
  } catch (err) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch (_) {}
    }
    return { success: false, error: { message: err.message } };
  }
}
