import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-vitest-do-not-use';
process.env.DATABASE_URL = 'file:./test.db';
process.env.CORS_ORIGIN = 'http://localhost:5173';
// Ensure relative prisma path resolves from apps/api/prisma
process.chdir(path.resolve(__dirname, '..'));
