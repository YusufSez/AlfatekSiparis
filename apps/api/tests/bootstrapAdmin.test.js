import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma, resetDb } from './helpers.js';
import { bootstrapAdmin } from '../src/common/bootstrapAdmin.js';

describe('bootstrapAdmin', () => {
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_NAME: process.env.ADMIN_NAME,
  };

  beforeEach(async () => {
    await resetDb();
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_NAME;
  });

  afterEach(() => {
    process.env.NODE_ENV = prev.NODE_ENV;
    for (const key of ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_NAME']) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  it('NODE_ENV=test iken atlar', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_USERNAME = 'bootstrapadmin';
    process.env.ADMIN_PASSWORD = 'securepass99';
    process.env.ADMIN_NAME = 'Bootstrap';
    expect(await bootstrapAdmin()).toBe('skipped');
  });

  it('env yoksa production’da atlar', async () => {
    process.env.NODE_ENV = 'production';
    expect(await bootstrapAdmin()).toBe('skipped');
  });

  it('kısmi env production’da hata verir', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_USERNAME = 'onlyuser';
    await expect(bootstrapAdmin()).rejects.toThrow(/birlikte/);
  });

  it('production’da admin oluşturur ve şifreyi hashler', async () => {
    await prisma.user.deleteMany();
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_USERNAME = 'BootstrapAdmin';
    process.env.ADMIN_PASSWORD = 'securepass99';
    process.env.ADMIN_NAME = 'Bootstrap Admin';

    expect(await bootstrapAdmin()).toBe('created');

    const user = await prisma.user.findUnique({ where: { username: 'bootstrapadmin' } });
    expect(user).toBeTruthy();
    expect(user.role).toBe('admin');
    expect(user.name).toBe('Bootstrap Admin');
    expect(user.passwordHash).not.toBe('securepass99');
    expect(await bcrypt.compare('securepass99', user.passwordHash)).toBe(true);

    expect(await bootstrapAdmin()).toBe('exists');
    expect(await prisma.user.count({ where: { role: 'admin', deletedAt: null } })).toBe(1);
  });

  it('mevcut admin varken yeniden oluşturmaz', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_USERNAME = 'anotheradmin';
    process.env.ADMIN_PASSWORD = 'securepass99';
    process.env.ADMIN_NAME = 'Another';

    // resetDb already seeded an admin
    expect(await bootstrapAdmin()).toBe('exists');
    expect(await prisma.user.findUnique({ where: { username: 'anotheradmin' } })).toBeNull();
  });
});
