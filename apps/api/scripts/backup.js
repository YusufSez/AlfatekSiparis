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

/** @typedef {{ backup: () => Promise<{ path: string }> }} BackupProvider */

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

/** İleride PostgreSQL için: pg_dump çağırır */
export class PostgresBackupProvider {
  constructor(connectionUrl) {
    this.connectionUrl = connectionUrl;
  }

  async backup() {
    throw new Error(
      'PostgresBackupProvider henüz aktif değil. DATABASE_URL postgres olduğunda pg_dump ile genişletin.'
    );
  }
}

export function createBackupProvider() {
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  if (url.startsWith('postgresql') || url.startsWith('postgres')) {
    return new PostgresBackupProvider(url);
  }
  // Prisma sqlite: file:./dev.db relative to prisma folder
  const relative = url.replace(/^file:/, '');
  const dbPath = path.isAbsolute(relative)
    ? relative
    : path.resolve(__dirname, '../prisma', relative);
  return new SqliteBackupProvider(dbPath);
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
