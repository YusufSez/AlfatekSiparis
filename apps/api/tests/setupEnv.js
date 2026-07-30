import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-vitest-do-not-use';
// Prefer caller-provided URL (CI). Local default matches docker-compose.yml Postgres.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://alfatek:alfatek@127.0.0.1:5432/alfatek';
process.env.CORS_ORIGIN = 'http://localhost:5173';
// Isolate from host/dev VAPID — tests do not require push delivery.
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_EMAIL;
// Ensure relative prisma path resolves from apps/api
process.chdir(path.resolve(__dirname, '..'));
