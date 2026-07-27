import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getApp, resetDb, loginAs, authHeader } from './helpers.js';

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
});
