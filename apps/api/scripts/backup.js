import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const backupsDir = path.join(root, 'backups');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}`;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`${cmd} bulunamadı. PostgreSQL client tools (pg_dump) PATH'te olmalı.`));
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

/** @typedef {{ backup: () => Promise<{ path: string, provider: string }> }} BackupProvider */

export class PostgresBackupProvider {
  constructor(connectionUrl) {
    this.connectionUrl = connectionUrl;
  }

  async backup() {
    fs.mkdirSync(backupsDir, { recursive: true });
    const target = path.join(backupsDir, `backup-${stamp()}.sql`);
    await run('pg_dump', [
      '--dbname',
      this.connectionUrl,
      '--no-owner',
      '--no-acl',
      '--format=plain',
      '--file',
      target,
    ]);
    return { path: target, provider: 'postgresql' };
  }
}

/** Legacy SQLite file copy (schema is PostgreSQL; kept for old local backups only). */
export class SqliteBackupProvider {
  constructor(dbFilePath) {
    this.dbFilePath = dbFilePath;
  }

  async backup() {
    if (!fs.existsSync(this.dbFilePath)) {
      throw new Error(`SQLite dosyası bulunamadı: ${this.dbFilePath}`);
    }
    fs.mkdirSync(backupsDir, { recursive: true });
    const target = path.join(backupsDir, `backup-${stamp()}.db`);
    fs.copyFileSync(this.dbFilePath, target);
    return { path: target, provider: 'sqlite' };
  }
}

export function createBackupProvider() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL tanımlı değil. PostgreSQL connection string gerekli.');
  }
  if (url.startsWith('postgresql') || url.startsWith('postgres')) {
    return new PostgresBackupProvider(url);
  }
  if (url.startsWith('file:')) {
    const relative = url.replace(/^file:/, '');
    const dbPath = path.isAbsolute(relative)
      ? relative
      : path.resolve(__dirname, '../prisma', relative);
    return new SqliteBackupProvider(dbPath);
  }
  throw new Error(`Desteklenmeyen DATABASE_URL (postgresql:// bekleniyor): ${url.slice(0, 32)}…`);
}

async function main() {
  const provider = createBackupProvider();
  const result = await provider.backup();
  console.log(`Backup OK → ${result.path}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
