import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-vitest-do-not-use';
process.env.DATABASE_URL = 'file:./test.db';
process.env.CORS_ORIGIN = 'http://localhost:5173';
// Isolate from host/dev VAPID — tests do not require push delivery.
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_EMAIL;
// Ensure relative prisma path resolves from apps/api/prisma
process.chdir(path.resolve(__dirname, '..'));
