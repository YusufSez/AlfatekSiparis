import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

export const APP_VERSION = pkg.version || '1.0.0';
export const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString();
export const startedAt = Date.now();

/** @type {{ io: import('socket.io').Server | null }} */
export const runtime = {
  io: null,
};

export function setSocketRuntime(io) {
  runtime.io = io;
}

export function isSocketReady() {
  return Boolean(runtime.io);
}
