import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const backupsDir = path.join(root, 'backups');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`${cmd} bulunamadı. PostgreSQL client tools (psql) PATH'te olmalı.`));
        return;
      }
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exit ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

/** @typedef {{ restore: (backupPath: string) => Promise<{ path: string, from: string, provider: string }> }} RestoreProvider */

export class PostgresRestoreProvider {
  constructor(connectionUrl) {
    this.connectionUrl = connectionUrl;
  }

  async restore(backupPath) {
    const resolved = path.isAbsolute(backupPath)
      ? backupPath
      : path.resolve(backupsDir, backupPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Yedek dosyası bulunamadı: ${resolved}`);
    }
    if (!resolved.endsWith('.sql')) {
      throw new Error('PostgreSQL restore için .sql yedek gerekli (pg_dump plain format).');
    }
    await run('psql', [
      '--dbname',
      this.connectionUrl,
      '--set',
      'ON_ERROR_STOP=1',
      '--file',
      resolved,
    ]);
    return { path: this.connectionUrl.replace(/:[^:@/]+@/, ':****@'), from: resolved, provider: 'postgresql' };
  }
}

/** Legacy SQLite file copy. */
export class SqliteRestoreProvider {
  constructor(dbFilePath) {
    this.dbFilePath = dbFilePath;
  }

  async restore(backupPath) {
    const resolved = path.isAbsolute(backupPath)
      ? backupPath
      : path.resolve(backupsDir, backupPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Yedek dosyası bulunamadı: ${resolved}`);
    }
    fs.mkdirSync(path.dirname(this.dbFilePath), { recursive: true });
    if (fs.existsSync(this.dbFilePath)) {
      const safety = `${this.dbFilePath}.pre-restore-${Date.now()}`;
      fs.copyFileSync(this.dbFilePath, safety);
    }
    fs.copyFileSync(resolved, this.dbFilePath);
    return { path: this.dbFilePath, from: resolved, provider: 'sqlite' };
  }
}

export function createRestoreProvider() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL tanımlı değil. PostgreSQL connection string gerekli.');
  }
  if (url.startsWith('postgresql') || url.startsWith('postgres')) {
    return new PostgresRestoreProvider(url);
  }
  if (url.startsWith('file:')) {
    const relative = url.replace(/^file:/, '');
    const dbPath = path.isAbsolute(relative)
      ? relative
      : path.resolve(__dirname, '../prisma', relative);
    return new SqliteRestoreProvider(dbPath);
  }
  throw new Error(`Desteklenmeyen DATABASE_URL (postgresql:// bekleniyor): ${url.slice(0, 32)}…`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Kullanım: npm run restore -- <backup-dosyası.sql>');
    console.error('Örnek: npm run restore -- backup-2026-07-30-16-00.sql');
    process.exit(1);
  }
  const provider = createRestoreProvider();
  const result = await provider.restore(arg);
  console.log(`Restore OK → ${result.path} (from ${result.from})`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
