import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getApp, resetDb, loginAs, authHeader, prisma } from './helpers.js';
import { DEFAULT_USER_PASSWORD } from '../src/common/passwords.js';

describe('AUTH', () => {
  let app;

  beforeAll(() => {
    app = getApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('başarılı login', async () => {
    const res = await loginAs(request(app), 'yusuf');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('yusuf');
    expect(res.body.user.mustChangePassword).toBe(false);
    expect(res.body.expiresIn).toBe('7d');
  });

  it('başarısız login', async () => {
    const res = await loginAs(request(app), 'yusuf', 'wrong');
    expect(res.status).toBe(401);
  });

  it('JWT doğrulama — /auth/me', async () => {
    const login = await loginAs(request(app), 'yusuf');
    const me = await request(app).get('/auth/me').set(authHeader(login.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('yusuf');
    expect(me.body.user.mustChangePassword).toBe(false);
  });

  it('rol kontrolü — office_user kitchen erişemez', async () => {
    const login = await loginAs(request(app), 'yusuf');
    const res = await request(app)
      .get('/kitchen/tickets')
      .set(authHeader(login.body.token));
    expect(res.status).toBe(403);
  });

  it('expired token', async () => {
    const login = await loginAs(request(app), 'yusuf');
    const decoded = jwt.decode(login.body.token);
    const expired = jwt.sign(
      {
        sub: decoded.sub,
        role: decoded.role,
        officeId: decoded.officeId,
        name: decoded.name,
        username: decoded.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    const me = await request(app).get('/auth/me').set(authHeader(expired));
    expect(me.status).toBe(401);
  });

  it('remember login — 7d vs 1d', async () => {
    const remembered = await loginAs(request(app), 'yusuf', '123456', true);
    const sessionOnly = await loginAs(request(app), 'yusuf', '123456', false);
    expect(remembered.body.expiresIn).toBe('7d');
    expect(sessionOnly.body.expiresIn).toBe('1d');
    const rem = jwt.decode(remembered.body.token);
    const ses = jwt.decode(sessionOnly.body.token);
    expect(rem.exp - rem.iat).toBeGreaterThan(ses.exp - ses.iat);
  });

  it('şifre değişince eski JWT reddedilir, yeni token çalışır', async () => {
    const login = await loginAs(request(app), 'yusuf', '123456');
    const oldToken = login.body.token;
    const change = await request(app)
      .post('/auth/password')
      .set(authHeader(oldToken))
      .send({ currentPassword: '123456', newPassword: 'newpass99', remember: true });
    expect(change.status).toBe(200);
    expect(change.body.token).toBeTruthy();
    expect(change.body.expiresIn).toBe('7d');
    expect(change.body.user.mustChangePassword).toBe(false);

    const meOld = await request(app).get('/auth/me').set(authHeader(oldToken));
    expect(meOld.status).toBe(401);

    const meNew = await request(app).get('/auth/me').set(authHeader(change.body.token));
    expect(meNew.status).toBe(200);

    const relogin = await loginAs(request(app), 'yusuf', 'newpass99');
    expect(relogin.status).toBe(200);
  });

  it('yeni kullanıcı ilk login — mustChangePassword true, uygulama API engelli', async () => {
    const admin = await loginAs(request(app), 'admin');
    const offices = await request(app).get('/admin/offices').set(authHeader(admin.body.token));
    const officeId = offices.body.offices[0].id;

    const created = await request(app)
      .post('/admin/users')
      .set(authHeader(admin.body.token))
      .send({
        name: 'Yeni Kullanıcı',
        username: 'yenikullanici',
        role: 'office_user',
        officeId,
      });
    expect(created.status).toBe(201);
    expect(created.body.user.mustChangePassword).toBe(true);

    const firstLogin = await loginAs(request(app), 'yenikullanici', DEFAULT_USER_PASSWORD);
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.user.mustChangePassword).toBe(true);
    expect(firstLogin.body.token).toBeTruthy();

    const blocked = await request(app)
      .get('/menu')
      .set(authHeader(firstLogin.body.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/şifre/i);

    const me = await request(app).get('/auth/me').set(authHeader(firstLogin.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);
  });

  it('zorunlu şifre değişikliği sonrası uygulamaya giriş', async () => {
    const admin = await loginAs(request(app), 'admin');
    const offices = await request(app).get('/admin/offices').set(authHeader(admin.body.token));
    const officeId = offices.body.offices[0].id;

    await request(app)
      .post('/admin/users')
      .set(authHeader(admin.body.token))
      .send({
        name: 'Zorunlu',
        username: 'zorunlu',
        role: 'office_user',
        officeId,
      });

    const login = await loginAs(request(app), 'zorunlu', DEFAULT_USER_PASSWORD);
    const change = await request(app)
      .post('/auth/password')
      .set(authHeader(login.body.token))
      .send({
        currentPassword: DEFAULT_USER_PASSWORD,
        newPassword: 'guvenli99',
        remember: true,
      });
    expect(change.status).toBe(200);
    expect(change.body.user.mustChangePassword).toBe(false);

    const menu = await request(app).get('/menu').set(authHeader(change.body.token));
    expect(menu.status).toBe(200);

    const relogin = await loginAs(request(app), 'zorunlu', 'guvenli99');
    expect(relogin.status).toBe(200);
    expect(relogin.body.user.mustChangePassword).toBe(false);
  });

  it('admin şifre sıfırlama sonrası tekrar zorunlu değişim', async () => {
    const admin = await loginAs(request(app), 'admin');
    const yusuf = await prisma.user.findUnique({ where: { username: 'yusuf' } });

    const reset = await request(app)
      .patch(`/admin/users/${yusuf.id}`)
      .set(authHeader(admin.body.token))
      .send({ password: 'adminreset1' });
    expect(reset.status).toBe(200);
    expect(reset.body.user.mustChangePassword).toBe(true);

    const login = await loginAs(request(app), 'yusuf', 'adminreset1');
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    const blocked = await request(app)
      .get('/sessions/active')
      .set(authHeader(login.body.token));
    expect(blocked.status).toBe(403);

    const change = await request(app)
      .post('/auth/password')
      .set(authHeader(login.body.token))
      .send({
        currentPassword: 'adminreset1',
        newPassword: 'yenisifre88',
        remember: true,
      });
    expect(change.status).toBe(200);
    expect(change.body.user.mustChangePassword).toBe(false);

    const ok = await request(app).get('/menu').set(authHeader(change.body.token));
    expect(ok.status).toBe(200);
  });
});
