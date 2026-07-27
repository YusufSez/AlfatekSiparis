import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const backupsDir = path.join(root, 'backups');

/** @typedef {{ restore: (backupPath: string) => Promise<{ path: string }> }} RestoreProvider */

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

/** İleride PostgreSQL için: psql / pg_restore */
export class PostgresRestoreProvider {
  constructor(connectionUrl) {
    this.connectionUrl = connectionUrl;
  }

  async restore() {
    throw new Error(
      'PostgresRestoreProvider henüz aktif değil. DATABASE_URL postgres olduğunda pg_restore ile genişletin.'
    );
  }
}

export function createRestoreProvider() {
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  if (url.startsWith('postgresql') || url.startsWith('postgres')) {
    return new PostgresRestoreProvider(url);
  }
  const relative = url.replace(/^file:/, '');
  const dbPath = path.isAbsolute(relative)
    ? relative
    : path.resolve(__dirname, '../prisma', relative);
  return new SqliteRestoreProvider(dbPath);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Kullanım: npm run restore -- <backup-dosyası>');
    console.error('Örnek: npm run restore -- backup-2026-07-27-10-00.db');
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
