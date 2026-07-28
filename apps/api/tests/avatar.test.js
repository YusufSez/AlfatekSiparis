import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, resetDb, loginAs, authHeader } from './helpers.js';
import { AVATARS_DIR, detectImageMime } from '../src/common/avatarStorage.js';

/** Minimal 1x1 PNG */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('avatarStorage helpers', () => {
  it('detects PNG magic bytes', () => {
    expect(detectImageMime(PNG_1X1)).toBe('image/png');
  });

  it('rejects non-image buffers', () => {
    expect(detectImageMime(Buffer.from('not-an-image'))).toBeNull();
  });
});

describe('AUTH AVATAR', () => {
  let app;

  beforeAll(() => {
    app = getApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(() => {
    try {
      if (fs.existsSync(AVATARS_DIR)) {
        for (const name of fs.readdirSync(AVATARS_DIR)) {
          if (name === '.gitkeep') continue;
          fs.unlinkSync(path.join(AVATARS_DIR, name));
        }
      }
    } catch {
      /* ignore */
    }
  });

  async function token(user = 'yusuf') {
    const res = await loginAs(request(app), user);
    return res.body.token;
  }

  it('uploads avatar for authenticated user', async () => {
    const t = await token();
    const res = await request(app)
      .post('/auth/avatar')
      .set(authHeader(t))
      .attach('avatar', PNG_1X1, { filename: 'me.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toMatch(/^\/uploads\/avatars\/avatar_/);
    const file = path.join(AVATARS_DIR, path.basename(res.body.user.avatarUrl));
    expect(fs.existsSync(file)).toBe(true);

    const staticRes = await request(app).get(res.body.user.avatarUrl);
    expect(staticRes.status).toBe(200);
  });

  it('rejects oversized declared mime mismatch / invalid type', async () => {
    const t = await token();
    const res = await request(app)
      .post('/auth/avatar')
      .set(authHeader(t))
      .attach('avatar', Buffer.from('%PDF-1.4 fake'), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
  });

  it('removes avatar and deletes file', async () => {
    const t = await token();
    const up = await request(app)
      .post('/auth/avatar')
      .set(authHeader(t))
      .attach('avatar', PNG_1X1, { filename: 'me.png', contentType: 'image/png' });
    const url = up.body.user.avatarUrl;
    const file = path.join(AVATARS_DIR, path.basename(url));

    const del = await request(app).delete('/auth/avatar').set(authHeader(t));
    expect(del.status).toBe(200);
    expect(del.body.user.avatarUrl).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('cannot upload without auth', async () => {
    const res = await request(app)
      .post('/auth/avatar')
      .attach('avatar', PNG_1X1, { filename: 'me.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });
});
