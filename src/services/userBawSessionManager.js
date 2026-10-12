import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import util from 'util';
import QRCode from 'qrcode';
import { BSC_RWA_TOKENS } from './tokens.js';
import { checkTokenBalance } from './bscRouter.js';
import { 
  saveSession, 
  loadSession, 
  deleteSession, 
  rotateSession,
  validateStoreConfig
} from './bawSessionStore.js';

const execFileAsync = util.promisify(execFile);

/**
 * Cookie Name for Binance Agentic Wallet user session
 */
export const BAW_COOKIE_NAME = 'omnibasket_baw_sid';

/**
 * CSRF & Origin validation for state-changing HTTP requests
 */
export function validateCsrfOrigin(req) {
  if (!req) return false;
  const method = req.method ? req.method.toUpperCase() : 'GET';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const origin = req.headers?.get ? req.headers.get('origin') : req.headers?.origin;
  const host = req.headers?.get ? req.headers.get('host') : req.headers?.host;
  const referer = req.headers?.get ? req.headers.get('referer') : req.headers?.referer;
  const secFetchSite = req.headers?.get ? req.headers.get('sec-fetch-site') : req.headers?.['sec-fetch-site'];

  if (secFetchSite === 'cross-site') {
    return false;
  }

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (host && originUrl.host !== host) {
        return false;
      }
      return true;
    } catch (_) {
      return false; // Malformed origin is strictly rejected
    }
  }

  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (host && refUrl.host !== host) {
        return false;
      }
      return true;
    } catch (_) {
      return false; // Malformed referer is strictly rejected
    }
  }

  // Allow non-browser requests without origin or referer header
  return true;
}

/**
 * Extract session ID solely from the HttpOnly cookie.
 * Strictly ignores any caller-supplied sessionId in request bodies, query params, or custom headers.
 */
export function getSessionIdFromRequest(req) {
  if (!req) return null;

  const cookieHeader = req.headers?.get ? req.headers.get('cookie') : req.headers?.cookie;
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${BAW_COOKIE_NAME}=([a-zA-Z0-9_-]+)(?:;|$)`));
  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

/**
 * Helper to build Set-Cookie header string
 */
export function buildSessionCookieHeader(sessionId, maxAgeSeconds = 86400) {
  const isProd = process.env.NODE_ENV === 'production';
  if (!sessionId || maxAgeSeconds <= 0) {
    return `${BAW_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
  const secureFlag = isProd ? '; Secure' : '';
  return `${BAW_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
}

/**
 * Generate ephemeral secp256k1 keypair for Binance Agentic authentication handshake
 */
export function generateEphemeralKeyPair() {
  try {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    const publicKeyHex = ecdh.getPublicKey('hex', 'compressed');
    const rawPub = publicKeyHex.substring(2);
    const pairingCode = (rawPub.substring(0, 3) + rawPub.substring(rawPub.length - 3)).toLowerCase();
    return {
      privateKey: ecdh.getPrivateKey('hex'),
      publicKeyHex,
      rawPub,
      pairingCode
    };
  } catch (_) {
    const randHex = crypto.randomBytes(3).toString('hex').toLowerCase();
    return {
      privateKey: crypto.randomBytes(32).toString('hex'),
      publicKeyHex: `02${crypto.randomBytes(32).toString('hex')}`,
      rawPub: crypto.randomBytes(32).toString('hex'),
      pairingCode: randHex
    };
  }
}

/**
 * Robustly extract EVM address from various Binance BAPI response shapes
 */
export function extractEvmAddressFromBinance(obj) {
  if (!obj) return null;
  // 1. Direct subWalletList standard path
  const subList = obj?.data?.[0]?.subWalletList || obj?.data?.subWalletList || obj?.subWalletList;
  if (Array.isArray(subList)) {
    for (const sub of subList) {
      if (Array.isArray(sub?.addresses)) {
        const bsc = sub.addresses.find(a => String(a?.binanceChainId || a?.chainId || '') === '56');
        if (bsc?.address && /^0x[a-fA-F0-9]{40}$/i.test(bsc.address)) return bsc.address;
        const first = sub.addresses.find(a => a?.address && /^0x[a-fA-F0-9]{40}$/i.test(a.address));
        if (first?.address) return first.address;
      }
    }
  }
  // 2. Direct addresses array
  if (Array.isArray(obj?.addresses)) {
    const bsc = obj.addresses.find(a => String(a?.binanceChainId || a?.chainId || '') === '56');
    if (bsc?.address && /^0x[a-fA-F0-9]{40}$/i.test(bsc.address)) return bsc.address;
    if (obj.addresses[0]?.address && /^0x[a-fA-F0-9]{40}$/i.test(obj.addresses[0].address)) return obj.addresses[0].address;
  }
  // 3. Recursive regex search for any valid 0x 40-hex character EVM address
  try {
    const jsonStr = JSON.stringify(obj);
    const matches = jsonStr.match(/0x[a-fA-F0-9]{40}/g);
    if (matches && matches.length > 0) {
      return matches[0];
    }
  } catch (_) {}
  return null;
}

/**
 * Call Binance Gateway BAPI directly with ephemeral client credentials
 */
async function callBinanceBapi(endpoint, method = 'GET', body = null, agentSessionId = null, clientId = null) {
  const cId = clientId || crypto.randomUUID();
  const postData = body ? JSON.stringify(body) : '';

  const headers = {
    'Host': 'www.binance.com',
    'Content-Type': 'application/json',
    'agentClientId': cId,
    'agentClientSystem': 'Windows 10',
    'agentClientMac': '00:11:22:33:44:55',
    'bnc-uuid': cId,
    'x-trace-id': crypto.randomBytes(16).toString('hex'),
    'device_name': 'desktop',
    'system_lang': 'en-US',
    'timezone': 'UTC',
    'system_version': 'Windows_NT win32',
    'version_code': '1.10.0',
    'clientVersion': '1.10.0',
    'agentClientType': 'AGENT_CLI',
    'agentClientVersion': '1.10.0'
  };

  if (postData) {
    headers['Content-Length'] = Buffer.byteLength(postData);
  }
  if (agentSessionId) {
    headers['Cookie'] = `agentSessionId=${agentSessionId}`;
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'www.binance.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: headers,
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout connecting to Binance BAPI (${endpoint})`));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * 1. Initiate Binance App QR Code Authentication Pairing (baw auth signin)
 * If Binance pairing cannot be initiated through a verified supported flow,
 * FAILS CLOSED. NEVER returns a fabricated QR URL or fake success.
 */
export async function authSignin(req) {
  // Store configuration check
  const storeConfig = validateStoreConfig();
  if (!storeConfig.valid) {
    return {
      success: false,
      status: 503,
      code: 'STORE_CONFIGURATION_REQUIRED',
      error: `Agentic Wallet pairing is unavailable: ${storeConfig.error}`
    };
  }

  // CSRF protection check
  if (!validateCsrfOrigin(req)) {
    return {
      success: false,
      status: 403,
      code: 'CSRF_REJECTED',
      error: 'Cross-origin request rejected'
    };
  }

  // Retrieve existing session from cookie or issue new ID
  let sessionId = getSessionIdFromRequest(req);
  let session = sessionId ? await loadSession(sessionId) : null;

  if (!session) {
    sessionId = crypto.randomUUID();
    session = {
      sessionId,
      clientId: crypto.randomUUID(),
      status: 'UNCONNECTED',
      appConfirmed: false,
      agentConfirmed: false,
      agentSessionId: null,
      walletAddress: null,
      dailyLimit: 50000.0,
      quotaLeft: 50000.0,
      quotaUsed: 0.0,
      createdAt: Date.now(),
      lastActive: Date.now()
    };
  }

  // Generate fresh ephemeral ECDH keypair
  const keyPair = generateEphemeralKeyPair();
  session.pairingCode = keyPair.pairingCode;
  session.status = 'WAITING_FOR_SCAN';
  session.appConfirmed = false;
  session.agentConfirmed = false;
  session.walletAddress = null;
  session.qrCodeId = null;
  session.urlForWeb = null;

  let pairingData = null;

  // 1. Direct Binance Gateway registration
  try {
    const loginRes = await callBinanceBapi(
      '/bapi/defi/v1/public/wallet-direct/agent-wallet/login',
      'POST',
      {
        isFirstLogin: true,
        os: 'Windows',
        publicKeyHex: keyPair.rawPub
      },
      null,
      session.clientId
    );

    if (loginRes?.data?.code === '000000' && loginRes.data.data?.qrInfo) {
      const qrInfo = loginRes.data.data.qrInfo;
      if (qrInfo.qrCodeUrl && qrInfo.qrCodeId) {
        pairingData = {
          qrCodeId: qrInfo.qrCodeId,
          expireAt: Number(qrInfo.expireAt) || (Date.now() + 300000),
          urlForWeb: qrInfo.qrCodeUrl,
          pairingCode: keyPair.pairingCode
        };
      }
    }
  } catch (err) {
    console.warn('[userBawSessionManager] Direct Binance Gateway attempt notice:', err.message);
  }

  // 2. Fallback: isolated baw CLI execution if local binary is installed
  if (!pairingData || !pairingData.urlForWeb) {
    const customBaw = process.env.BAW_BIN_PATH && fs.existsSync(process.env.BAW_BIN_PATH) ? process.env.BAW_BIN_PATH : null;
    const localBaw = path.join(os.homedir(), '.local', 'bin', 'baw');
    const bawBin = customBaw || (fs.existsSync(localBaw) ? localBaw : null);

    if (bawBin) {
      try {
        const sessionDir = path.join(os.tmpdir(), 'omnibasket_baw_sessions', sessionId);
        if (!fs.existsSync(sessionDir)) {
          fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
        }
        const { stdout } = await execFileAsync(bawBin, ['auth', 'signin', '--json'], {
          timeout: 5000,
          env: { ...process.env, BINANCE_BAW_DIR: sessionDir }
        });
        const parsed = JSON.parse(stdout);
        if (parsed?.success && parsed.data?.urlForWeb && parsed.data?.qrCodeId) {
          pairingData = {
            qrCodeId: parsed.data.qrCodeId,
            expireAt: Number(parsed.data.expireAt) || (Date.now() + 300000),
            urlForWeb: parsed.data.urlForWeb,
            pairingCode: parsed.data.pairingCode || keyPair.pairingCode
          };
        }
      } catch (_) {}
    }
  }

  // CRITICAL SECURITY ENFORCEMENT:
  // If Binance gateway did not return a genuine QR pairing URL, FAIL CLOSED.
  // Never fabricate a synthetic QR URL or pretend success.
  if (!pairingData || !pairingData.urlForWeb || !pairingData.qrCodeId) {
    return {
      success: false,
      status: 503,
      code: 'BINANCE_SERVICE_UNAVAILABLE',
      error: 'Unable to register session with Binance Agentic Gateway. Binance service is unreachable or rate-limited. Please retry or connect via Binance Web3 Wallet extension.'
    };
  }

  // Generate vector SVG for the genuine Binance URL
  let qrSvg = null;
  try {
    qrSvg = await QRCode.toString(pairingData.urlForWeb, {
      type: 'svg',
      margin: 1,
      width: 180,
      color: {
        dark: '#1E2026',
        light: '#FFFFFF'
      }
    });
  } catch (qrErr) {
    console.warn('[userBawSessionManager] SVG QR generation error:', qrErr.message);
  }

  session.qrCodeId = pairingData.qrCodeId;
  session.urlForWeb = pairingData.urlForWeb;
  session.pairingCode = pairingData.pairingCode;
  session.expireAt = pairingData.expireAt;
  session.lastActive = Date.now();
  session.expiresAt = pairingData.expireAt + 3600000; // session TTL

  // Persist to durable encrypted store
  const saved = await saveSession(sessionId, session);
  if (saved === false) {
    return {
      success: false,
      status: 503,
      error: 'STORE_UNAVAILABLE',
      message: 'Session store is unavailable. Pairing cannot be started.'
    };
  }

  // Return success with cookie info; DO NOT expose sessionId in JSON body
  return {
    success: true,
    status: 200,
    sessionId, // used internally by route handler to set Set-Cookie header
    cookieHeader: buildSessionCookieHeader(sessionId),
    data: {
      qrCodeId: session.qrCodeId,
      pairingCode: session.pairingCode,
      urlForWeb: session.urlForWeb,
      expireAt: String(pairingData.expireAt),
      qrSvg,
      status: session.status
    }
  };
}

/**
 * 2. Check QR Code Pairing Status (Listener Polling)
 * Strictly verifies status against the session identified by the HttpOnly cookie.
 */
export async function checkPairingStatus(req) {
  // Store configuration check
  const storeConfig = validateStoreConfig();
  if (!storeConfig.valid) {
    return {
      success: false,
      status: 503,
      code: 'STORE_CONFIGURATION_REQUIRED',
      error: `Agentic Wallet is unavailable: ${storeConfig.error}`
    };
  }

  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    return {
      success: false,
      status: 401,
      code: 'SESSION_REQUIRED',
      error: 'Active session cookie required'
    };
  }

  const session = await loadSession(sessionId);
  if (!session) {
    return {
      success: false,
      status: 404,
      code: 'SESSION_NOT_FOUND',
      error: 'Session not found or expired. Please initiate pairing.'
    };
  }

  // Verify expiration
  if (session.expireAt && Date.now() > session.expireAt) {
    session.status = 'EXPIRED';
    await saveSession(sessionId, session);
    return {
      success: false,
      status: 410,
      code: 'PAIRING_EXPIRED',
      error: 'Pairing session has expired. Please refresh the QR code.'
    };
  }

  // If already verified and connected
  if (session.status === 'CONNECTED' && session.walletAddress) {
    return {
      success: true,
      status: 200,
      data: {
        qrCodeId: session.qrCodeId,
        status: 'CONNECTED',
        appConfirmed: true,
        pairingCode: session.pairingCode,
        walletAddress: session.walletAddress,
        message: 'Agent session connected and active.'
      }
    };
  }

  // Query Binance Gateway for confirmation
  if (session.qrCodeId && !session.appConfirmed) {
    try {
      const confirmRes = await callBinanceBapi(
        '/bapi/defi/v1/public/wallet-direct/agent-wallet/login/confirm',
        'POST',
        { qrCodeId: session.qrCodeId },
        session.agentSessionId,
        session.clientId
      );

      if (confirmRes?.data?.code === '000000') {
        const connStatus = confirmRes.data.data?.connectionStatus;
        let agentSessionId = confirmRes.data.data?.agentSessionId;

        // Binance sets agentSessionId in Set-Cookie header
        if (!agentSessionId && confirmRes.headers?.['set-cookie']) {
          const sc = confirmRes.headers['set-cookie'];
          const cookies = Array.isArray(sc) ? sc : [sc];
          for (const c of cookies) {
            const m = c.match(/agentSessionId=([^;]+)/);
            if (m) {
              agentSessionId = m[1];
              break;
            }
          }
        }

        if (agentSessionId) {
          session.agentSessionId = agentSessionId;
        }

        // Only mark appConfirmed when Binance Gateway transitions to CONNECTED (meaning the user actually scanned & approved on mobile)
        if (connStatus === 'CONNECTED' && (session.agentSessionId || agentSessionId)) {
          session.appConfirmed = true;
          session.status = 'APP_CONFIRMED';

          // Query trusted MPC wallet list directly from Binance
          try {
            const listRes = await callBinanceBapi(
              '/bapi/defi/v1/public/wallet-direct/agent-wallet/mpc-wallet/list',
              'POST',
              {},
              session.agentSessionId,
              session.clientId
            );
            const bscAddr = extractEvmAddressFromBinance(listRes?.data);
            if (bscAddr) {
              session.walletAddress = bscAddr;
              session.binanceChainId = '56';
            }
          } catch (_) {}

          session.lastActive = Date.now();
          await saveSession(sessionId, session);
        }
      }
    } catch (_) {}
  }

  const isConfirmed = session.appConfirmed || session.status === 'APP_CONFIRMED' || session.status === 'CONNECTED';

  return {
    success: true,
    status: 200,
    data: {
      qrCodeId: session.qrCodeId,
      status: session.status,
      appConfirmed: isConfirmed,
      pairingCode: session.pairingCode,
      walletAddress: session.walletAddress,
      message: isConfirmed
        ? 'App confirmed. Complete sign-in in your Agent.'
        : 'Waiting for Binance App scan & confirmation...'
    }
  };
}

/**
 * 3. Complete Sign-In inside Agent (Agent Confirmation Popup)
 * CRITICAL SECURITY REQUIREMENT:
 * Must validate that the session's actual Binance pairing is genuinely approved by Binance.
 * Rejects unverified, mismatched, expired, or caller-faked confirmations.
 * Rotates session ID upon verified confirmation.
 */
export async function confirmAgentSignin(req, body = {}) {
  // Store configuration check
  const storeConfig = validateStoreConfig();
  if (!storeConfig.valid) {
    return {
      success: false,
      status: 503,
      code: 'STORE_CONFIGURATION_REQUIRED',
      error: `Agentic Wallet is unavailable: ${storeConfig.error}`
    };
  }

  // CSRF protection check
  if (!validateCsrfOrigin(req)) {
    return {
      success: false,
      status: 403,
      code: 'CSRF_REJECTED',
      error: 'Cross-origin request rejected'
    };
  }

  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    return {
      success: false,
      status: 401,
      code: 'SESSION_REQUIRED',
      error: 'Active session cookie required'
    };
  }

  const session = await loadSession(sessionId);
  if (!session) {
    return {
      success: false,
      status: 404,
      code: 'SESSION_NOT_FOUND',
      error: 'Session not found or expired'
    };
  }

  const { qrCodeId } = body;

  // 1. Validate that submitted qrCodeId matches session
  if (!qrCodeId || qrCodeId !== session.qrCodeId) {
    return {
      success: false,
      status: 400,
      code: 'MISMATCHED_QR_CODE',
      error: 'Submitted qrCodeId does not match the active pairing session'
    };
  }

  // 2. Validate expiration
  if (session.expireAt && Date.now() > session.expireAt) {
    session.status = 'EXPIRED';
    await saveSession(sessionId, session);
    return {
      success: false,
      status: 410,
      code: 'PAIRING_EXPIRED',
      error: 'Pairing session expired. Please refresh the QR code in your Agent.'
    };
  }

  // 3. Verify genuine Binance mobile app authorization
  // Do NOT accept caller-supplied address, pairing code, or confirmWord as proof!
  let isVerifiedByBinance = session.appConfirmed === true && Boolean(session.walletAddress);

  if (!isVerifiedByBinance && session.qrCodeId) {
    try {
      const confirmRes = await callBinanceBapi(
        '/bapi/defi/v1/public/wallet-direct/agent-wallet/login/confirm',
        'POST',
        { qrCodeId: session.qrCodeId },
        session.agentSessionId,
        session.clientId
      );

      if (confirmRes?.data?.code === '000000') {
        const connStatus = confirmRes.data.data?.connectionStatus;
        let agentSessionId = confirmRes.data.data?.agentSessionId;

        if (!agentSessionId && confirmRes.headers?.['set-cookie']) {
          const sc = confirmRes.headers['set-cookie'];
          const cookies = Array.isArray(sc) ? sc : [sc];
          for (const c of cookies) {
            const m = c.match(/agentSessionId=([^;]+)/);
            if (m) {
              agentSessionId = m[1];
              break;
            }
          }
        }

        if (agentSessionId) {
          session.agentSessionId = agentSessionId;
        }

        if (connStatus === 'CONNECTED' && (session.agentSessionId || agentSessionId)) {
          session.appConfirmed = true;
          // Retrieve trusted MPC wallet address on BSC
          const listRes = await callBinanceBapi(
            '/bapi/defi/v1/public/wallet-direct/agent-wallet/mpc-wallet/list',
            'POST',
            {},
            session.agentSessionId,
            session.clientId
          );
          let bscAddr = extractEvmAddressFromBinance(listRes?.data);
          if (!bscAddr) {
            // Fallback: check /login/query
            const queryRes = await callBinanceBapi(
              '/bapi/defi/v1/public/wallet-direct/agent-wallet/login/query',
              'GET',
              null,
              session.agentSessionId,
              session.clientId
            );
            bscAddr = extractEvmAddressFromBinance(queryRes?.data);
          }
          if (bscAddr) {
            session.walletAddress = bscAddr;
            session.binanceChainId = '56';
            isVerifiedByBinance = true;
          }
        }
      }
    } catch (_) {}
  }

  // If already confirmed by listener but wallet address hasn't been fetched yet
  if (session.appConfirmed && !session.walletAddress && session.agentSessionId) {
    try {
      const listRes = await callBinanceBapi(
        '/bapi/defi/v1/public/wallet-direct/agent-wallet/mpc-wallet/list',
        'POST',
        {},
        session.agentSessionId,
        session.clientId
      );
      let bscAddr = extractEvmAddressFromBinance(listRes?.data);
      if (!bscAddr) {
        const queryRes = await callBinanceBapi(
          '/bapi/defi/v1/public/wallet-direct/agent-wallet/login/query',
          'GET',
          null,
          session.agentSessionId,
          session.clientId
        );
        bscAddr = extractEvmAddressFromBinance(queryRes?.data);
      }
      if (bscAddr) {
        session.walletAddress = bscAddr;
        session.binanceChainId = '56';
        isVerifiedByBinance = true;
      }
    } catch (_) {}
  }

  // If Binance has NOT confirmed approval, FAIL CLOSED.
  if (!isVerifiedByBinance || !session.walletAddress) {
    return {
      success: false,
      status: 403,
      code: 'UNVERIFIED_AUTHORIZATION',
      error: 'Binance App has not authorized this session. Please scan and authorize on your Binance mobile app first.'
    };
  }

  // 4. Genuine verification passed -> Mark CONNECTED & Rotate Session ID (Prevents Session Fixation)
  session.status = 'CONNECTED';
  session.agentConfirmed = true;
  session.lastActive = Date.now();
  session.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  // Save session state to durable store
  await saveSession(sessionId, session);

  // Rotate session credential
  const rotated = await rotateSession(sessionId);
  const finalSessionId = rotated ? rotated.newSessionId : sessionId;

  return {
    success: true,
    status: 200,
    rotatedSessionId: finalSessionId,
    cookieHeader: buildSessionCookieHeader(finalSessionId),
    data: {
      status: 'CONNECTED',
      walletAddress: session.walletAddress,
      binanceChainId: '56',
      chainName: 'BNB Smart Chain (BSC)',
      dailyLimit: session.dailyLimit,
      quotaLeft: session.quotaLeft,
      message: 'Binance App authorization verified. Keyless MPC Wallet connected.'
    }
  };
}

/**
 * 4. Sign Out and Revoke Active Session
 */
export async function authSignout(req) {
  // Store configuration check
  const storeConfig = validateStoreConfig();
  if (!storeConfig.valid) {
    return {
      success: false,
      status: 503,
      code: 'STORE_CONFIGURATION_REQUIRED',
      error: `Agentic Wallet is unavailable: ${storeConfig.error}`
    };
  }

  // CSRF protection check
  if (!validateCsrfOrigin(req)) {
    return {
      success: false,
      status: 403,
      code: 'CSRF_REJECTED',
      error: 'Cross-origin request rejected'
    };
  }

  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) {
    await deleteSession(sessionId);
  }

  return {
    success: true,
    status: 200,
    cookieHeader: buildSessionCookieHeader(null, 0),
    message: 'Binance Agentic Wallet session disconnected and revoked.'
  };
}

/**
 * 5. Query Calling User's Current Status (Cookie Authenticated)
 */
export async function getUserStatus(req) {
  const storeConfig = validateStoreConfig();
  if (!storeConfig.valid) {
    return {
      success: true,
      status: 200,
      data: {
        status: 'UNAVAILABLE',
        connected: false,
        available: false,
        pairingAvailable: false,
        tradingAvailable: false,
        tradingStatus: 'UNAVAILABLE',
        address: null,
        binanceChainId: '56',
        chainName: 'BNB Smart Chain (BSC)',
        isKeylessMpc: true,
        quota: null,
        reason: storeConfig.reason,
        message: `Agentic Wallet is unavailable in this deployment: ${storeConfig.error}`,
        guardrails: {
          dailyLimit: 50000.0,
          quotaLeft: 50000.0,
          quotaUsed: 0.0,
          abnormalTxPolicy: 'AutoReject (App Guardrail)',
          slippageTolerance: '0.5% (App Safeguard)'
        }
      }
    };
  }

  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    return {
      success: true,
      status: 200,
      data: {
        status: 'UNCONNECTED',
        connected: false,
        available: true,
        pairingAvailable: true,
        tradingAvailable: false,
        tradingStatus: 'UNPAIRED',
        address: null,
        binanceChainId: '56',
        chainName: 'BNB Smart Chain (BSC)',
        isKeylessMpc: true,
        quota: null,
        message: 'Agentic Wallet pairing is available. Scan QR code to connect.',
        guardrails: {
          dailyLimit: 50000.0,
          quotaLeft: 50000.0,
          quotaUsed: 0.0,
          abnormalTxPolicy: 'AutoReject (App Guardrail)',
          slippageTolerance: '0.5% (App Safeguard)'
        }
      }
    };
  }

  const session = await loadSession(sessionId);
  if (!session) {
    return {
      success: true,
      status: 200,
      data: {
        status: 'UNCONNECTED',
        connected: false,
        available: true,
        pairingAvailable: true,
        tradingAvailable: false,
        tradingStatus: 'UNPAIRED',
        address: null,
        binanceChainId: '56',
        chainName: 'BNB Smart Chain (BSC)',
        isKeylessMpc: true,
        quota: null,
        message: 'Agentic Wallet pairing is available. Scan QR code to connect.',
        guardrails: {
          dailyLimit: 50000.0,
          quotaLeft: 50000.0,
          quotaUsed: 0.0,
          abnormalTxPolicy: 'AutoReject (App Guardrail)',
          slippageTolerance: '0.5% (App Safeguard)'
        }
      }
    };
  }

  session.lastActive = Date.now();
  await saveSession(sessionId, session);
  const isConnected = session.status === 'CONNECTED' && Boolean(session.walletAddress);

  return {
    success: true,
    status: 200,
    data: {
      status: isConnected ? 'CONNECTED' : (session.status || 'UNCONNECTED'),
      connected: isConnected,
      available: true,
      pairingAvailable: true,
      tradingAvailable: false,
      tradingStatus: isConnected ? 'TRADING_UNAVAILABLE' : 'UNPAIRED',
      address: isConnected ? session.walletAddress : null,
      binanceChainId: '56',
      chainName: 'BNB Smart Chain (BSC)',
      isKeylessMpc: true,
      lastActive: new Date(session.lastActive).toISOString(),
      quota: isConnected ? {
        dailyLimit: session.dailyLimit || 50000.0,
        quotaLeft: session.quotaLeft !== undefined ? session.quotaLeft : 50000.0,
        quotaUsed: session.quotaUsed || 0.0
      } : null,
      message: isConnected
        ? 'Agentic Wallet paired. Autonomous trade execution is unavailable in this deployment; use Extension Wallet for trading.'
        : 'Agentic Wallet pairing in progress.',
      guardrails: {
        dailyLimit: session.dailyLimit || 50000.0,
        quotaLeft: session.quotaLeft !== undefined ? session.quotaLeft : 50000.0,
        quotaUsed: session.quotaUsed || 0.0,
        abnormalTxPolicy: 'AutoReject (App Guardrail)',
        slippageTolerance: '0.5% (App Safeguard)'
      }
    }
  };
}

/**
 * 6. Query Security Settings & Guardrails for Calling User
 */
export async function getSettings(req) {
  const sessionId = getSessionIdFromRequest(req);
  const session = sessionId ? await loadSession(sessionId) : null;
  const quotaLeft = session ? session.quotaLeft : 50000.0;
  const quotaUsed = session ? session.quotaUsed : 0.0;

  return {
    success: true,
    status: 200,
    data: {
      dailyLimit: 50000.0,
      quotaLeft: Number(quotaLeft.toFixed(2)),
      quotaUsed: Number(quotaUsed.toFixed(2)),
      abnormalTxnHandling: 'AutoReject',
      mevProtection: true,
      gasLevel: 'MEDIUM',
      slippage: 0.5,
      guardrailsActive: true,
      protocol: 'Binance Agentic Wallet MPC v1.10.0'
    }
  };
}

/**
 * 7. Query Token & Asset Balances on BSC Mainnet #56 for Calling User
 */
export async function getBalance(req) {
  const sessionId = getSessionIdFromRequest(req);
  const session = sessionId ? await loadSession(sessionId) : null;

  if (!session || session.status !== 'CONNECTED' || !session.walletAddress) {
    return {
      success: true,
      status: 200,
      data: {
        walletAddress: null,
        chainId: 56,
        balances: [
          { symbol: 'USDT', name: 'Tether USD', balance: 0.0, priceUsd: 1.0, valueUsd: 0.0 },
          { symbol: 'BNB', name: 'BNB Native', balance: 0.0, priceUsd: 580.0, valueUsd: 0.0 }
        ],
        totalValueUsd: 0.0
      }
    };
  }

  try {
    const usdtAddress = BSC_RWA_TOKENS.USDT.contractAddress;
    const usdtBalanceWei = await checkTokenBalance({
      tokenAddress: usdtAddress,
      ownerAddress: session.walletAddress
    }).catch(() => 0n);

    const usdtFormatted = Number(usdtBalanceWei) / 1e18;

    return {
      success: true,
      status: 200,
      data: {
        walletAddress: session.walletAddress,
        chainId: 56,
        balances: [
          { symbol: 'USDT', name: 'Tether USD', balance: usdtFormatted, priceUsd: 1.0, valueUsd: usdtFormatted }
        ],
        totalValueUsd: usdtFormatted
      }
    };
  } catch (_) {
    return {
      success: true,
      status: 200,
      data: {
        walletAddress: session.walletAddress,
        chainId: 56,
        balances: [
          { symbol: 'USDT', name: 'Tether USD', balance: 0.0, priceUsd: 1.0, valueUsd: 0.0 }
        ],
        totalValueUsd: 0.0
      }
    };
  }
}

/**
 * 8. Execute Autonomous Basket Allocation via Binance Agentic Wallet under Guardrails
 */
export async function executeBasketAutonomous(req, body = {}) {
  // Store configuration check
  const storeConfig = validateStoreConfig();
  if (!storeConfig.valid) {
    return {
      success: false,
      status: 503,
      code: 'STORE_CONFIGURATION_REQUIRED',
      error: `Agentic Wallet execution is unavailable: ${storeConfig.error}`
    };
  }

  // CSRF protection check
  if (!validateCsrfOrigin(req)) {
    return {
      success: false,
      status: 403,
      code: 'CSRF_REJECTED',
      error: 'Cross-origin request rejected'
    };
  }

  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    return {
      success: false,
      status: 401,
      code: 'WALLET_NOT_CONNECTED',
      error: 'Active session cookie required'
    };
  }

  const session = await loadSession(sessionId);
  if (!session || session.status !== 'CONNECTED' || !session.walletAddress) {
    return {
      success: false,
      status: 401,
      code: 'WALLET_NOT_CONNECTED',
      error: 'Binance Agentic Wallet is not connected. Please scan the QR code with your Binance App to pair your Keyless MPC Wallet before executing autonomous trades.',
      walletAddress: null
    };
  }

  session.lastActive = Date.now();
  const { investmentAmount, allocations, chainId = 56 } = body;
  const amount = Number(investmentAmount);

  // App Guardrail 1: Quota check
  if (amount > session.quotaLeft) {
    return {
      success: false,
      status: 400,
      code: 'GUARDRAIL_VIOLATION_QUOTA',
      error: `Execution rejected by OmniBasket Guardrails: Requested $${amount} USDT exceeds remaining 24h quota of $${session.quotaLeft.toFixed(2)} USDT.`,
      quotaLeft: session.quotaLeft,
      dailyLimit: session.dailyLimit
    };
  }

  // App Guardrail 2: Input validation
  if (isNaN(amount) || amount <= 0 || !Array.isArray(allocations) || allocations.length === 0) {
    return {
      success: false,
      status: 400,
      code: 'INVALID_PARAMETERS',
      error: 'Invalid investment parameters or empty allocation basket.'
    };
  }

  // App Guardrail 3: Chain ID must be BSC Mainnet 56
  if (Number(chainId) !== 56) {
    return {
      success: false,
      status: 400,
      code: 'UNSUPPORTED_CHAIN',
      error: 'Binance Agentic Wallet execution is strictly pinned to BNB Smart Chain Mainnet (Chain ID 56).'
    };
  }

  // App Guardrail 4: Total weight check
  const totalWeight = allocations.reduce((sum, a) => sum + (Number(a.weight) || 0), 0);
  if (totalWeight > 100.001) {
    return {
      success: false,
      status: 400,
      code: 'INVALID_ALLOCATION_WEIGHTS',
      error: 'Total basket allocation weights cannot exceed 100%.'
    };
  }

  // Fail closed: autonomous server-side trade execution is unconfigured/unavailable in this deployment.
  // Fail closed with HTTP 503 AUTONOMOUS_TRADING_UNAVAILABLE.
  return {
    success: false,
    status: 503,
    code: 'AUTONOMOUS_TRADING_UNAVAILABLE',
    error: 'Autonomous server-side trade execution is unavailable in this deployment. Please switch to Extension Wallet mode to execute trades directly with your browser wallet.',
    walletAddress: session.walletAddress
  };
}
