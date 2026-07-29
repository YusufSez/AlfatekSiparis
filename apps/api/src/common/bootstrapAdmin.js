import bcrypt from 'bcryptjs';
import { prisma } from './db.js';
import { logger } from './logger.js';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Production-only first admin bootstrap.
 *
 * Runs only when NODE_ENV=production and all of:
 *   ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME
 * are set. Skips if any admin already exists or username is taken.
 * Never logs the password.
 *
 * @returns {Promise<'skipped' | 'created' | 'exists'>}
 */
export async function bootstrapAdmin() {
  if (process.env.NODE_ENV !== 'production') {
    return 'skipped';
  }

  const usernameRaw = String(process.env.ADMIN_USERNAME || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || '').trim();

  const anySet = Boolean(usernameRaw || password || name);
  if (!anySet) {
    return 'skipped';
  }

  if (!usernameRaw || !password || !name) {
    throw new Error(
      'Admin bootstrap: ADMIN_USERNAME, ADMIN_PASSWORD ve ADMIN_NAME birlikte tanımlanmalıdır'
    );
  }

  if (usernameRaw.length < 2) {
    throw new Error('Admin bootstrap: ADMIN_USERNAME en az 2 karakter olmalıdır');
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Admin bootstrap: ADMIN_PASSWORD en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır`
    );
  }

  const username = usernameRaw.toLowerCase();

  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'admin', deletedAt: null },
    select: { id: true, username: true },
  });
  if (existingAdmin) {
    logger.info('admin.bootstrap_skipped', {
      reason: 'admin_exists',
      username: existingAdmin.username,
    });
    return 'exists';
  }

  const taken = await prisma.user.findFirst({
    where: { username },
    select: { id: true },
  });
  if (taken) {
    logger.info('admin.bootstrap_skipped', {
      reason: 'username_taken',
      username,
    });
    return 'exists';
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      username,
      passwordHash,
      role: 'admin',
      active: true,
      mustChangePassword: false,
    },
    select: { id: true, username: true },
  });

  logger.info('admin.bootstrap_created', {
    id: user.id,
    username: user.username,
  });
  return 'created';
}
