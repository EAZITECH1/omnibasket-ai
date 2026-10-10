import fs from 'fs';
import path from 'path';
import os from 'os';

export function ensureBawSession() {
  const bawDir = process.env.BINANCE_BAW_DIR || path.join(os.homedir(), '.baw');
  const sessionPath = path.join(bawDir, 'session.json');

  if (process.env.BINANCE_BAW_SESSION_JSON) {
    try {
      let raw = process.env.BINANCE_BAW_SESSION_JSON.trim();
      // Handle potential extra outer quotes from env vars
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

      // Write if file doesn't exist or is empty
      if (!fs.existsSync(sessionPath) || fs.statSync(sessionPath).size === 0) {
        fs.writeFileSync(sessionPath, typeof raw === 'string' ? raw : JSON.stringify(raw), 'utf8');
        console.log('Restored baw session.json from BINANCE_BAW_SESSION_JSON env variable');
      }
    } catch (err) {
      console.warn('Failed to restore baw session from env:', err.message);
    }
  }
}
