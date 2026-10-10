import fs from 'fs';
import path from 'path';
import os from 'os';

export function ensureBawSession() {
  const bawDir = process.env.BINANCE_BAW_DIR || path.join(os.homedir(), '.baw');
  const sessionPath = path.join(bawDir, 'session.json');

  if (!fs.existsSync(sessionPath) && process.env.BINANCE_BAW_SESSION_JSON) {
    try {
      if (!fs.existsSync(bawDir)) {
        fs.mkdirSync(bawDir, { recursive: true });
      }
      fs.writeFileSync(sessionPath, process.env.BINANCE_BAW_SESSION_JSON.trim(), 'utf8');
      console.log('Restored baw session.json from BINANCE_BAW_SESSION_JSON env variable');
    } catch (err) {
      console.warn('Failed to restore baw session from env:', err.message);
    }
  }
}
