import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp, resetDb, loginAs, authHeader, prisma } from './helpers.js';
import { finalizeSession } from '../src/modules/orders/orders.domain.js';

describe('SESSION', () => {
  let app;
  let fixtures;

  beforeAll(() => {
    app = getApp();
  });

  beforeEach(async () => {
    fixtures = await resetDb();
  });

  async function token(user = 'yusuf') {
    const res = await loginAs(request(app), user);
    return res.body.token;
  }

  it('sipariş açma', async () => {
    const t = await token();
    const res = await request(app).post('/sessions').set(authHeader(t)).send({});
    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe('collecting');
    expect(res.body.session.officeId).toBe(fixtures.teknik.id);
  });

  it('aynı ofiste ikinci sipariş açılamaz', async () => {
    const t = await token();
    const first = await request(app).post('/sessions').set(authHeader(t)).send({});
    expect(first.status).toBe(201);
    const second = await request(app).post('/sessions').set(authHeader(t)).send({});
    expect(second.status).toBe(409);
  });

  it('line update ve remove', async () => {
    const t = await token();
    const opened = await request(app).post('/sessions').set(authHeader(t)).send({});
    const sid = opened.body.session.id;
    const up = await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.tea.id, qty: 2 });
    expect(up.status).toBe(200);
    expect(up.body.session.lines.some((l) => l.qty === 2)).toBe(true);

    const rm = await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.tea.id, qty: 0 });
    expect(rm.status).toBe(200);
    expect(rm.body.session.lines.length).toBe(0);
  });

  it('confirm → sent + ticket', async () => {
    const t = await token();
    const opened = await request(app).post('/sessions').set(authHeader(t)).send({});
    const sid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.tea.id, qty: 1 });
    const conf = await request(app)
      .post(`/sessions/${sid}/confirm`)
      .set(authHeader(t))
      .send({});
    expect(conf.status).toBe(200);
    expect(conf.body.session.status).toBe('sent');
    const ticket = await prisma.kitchenTicket.findUnique({ where: { sessionId: sid } });
    expect(ticket).toBeTruthy();
  });

  it('duplicate confirm reddedilir', async () => {
    const t = await token();
    const opened = await request(app).post('/sessions').set(authHeader(t)).send({});
    const sid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.tea.id, qty: 1 });
    const first = await request(app)
      .post(`/sessions/${sid}/confirm`)
      .set(authHeader(t))
      .send({});
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/sessions/${sid}/confirm`)
      .set(authHeader(t))
      .send({});
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it('timeout finalize', async () => {
    const t = await token();
    const opened = await request(app).post('/sessions').set(authHeader(t)).send({});
    const sid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.tea.id, qty: 1 });

    const result = await finalizeSession(sid, 'timeout', null, { requestId: 'test-timeout' });
    expect(result).toBeTruthy();
    expect(result.status).toBe('sent');
  });

  it('özel istek kaydedilir ve ticketa yazılır', async () => {
    const t = await token();
    const opened = await request(app).post('/sessions').set(authHeader(t)).send({});
    const sid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.tea.id, qty: 1 });
    const noteRes = await request(app)
      .post(`/sessions/${sid}/special-request`)
      .set(authHeader(t))
      .send({ note: 'Şekersiz olsun' });
    expect(noteRes.status).toBe(200);
    expect(noteRes.body.session.specialRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ note: 'Şekersiz olsun', userId: fixtures.yusuf.id }),
      ])
    );

    const conf = await request(app)
      .post(`/sessions/${sid}/confirm`)
      .set(authHeader(t))
      .send({});
    expect(conf.status).toBe(200);
    const ticket = await prisma.kitchenTicket.findUnique({ where: { sessionId: sid } });
    const parsed = JSON.parse(ticket.summaryJson);
    expect(parsed.specialRequests).toEqual(
      expect.arrayContaining([expect.objectContaining({ note: 'Şekersiz olsun' })])
    );
  });

  it('staff-call bildirim gönderir ve 30sn spam koruması uygular', async () => {
    const t = await token();
    const first = await request(app).post('/sessions/staff-call').set(authHeader(t)).send({});
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    const notes = await prisma.userNotification.findMany({
      where: { event: 'kitchen:staff_call' },
      include: { user: { select: { role: true } } },
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].title).toBe('Cemile Abla');
    expect(notes[0].body).toContain('Teknik Ofis');
    expect(notes.every((n) => n.user.role === 'kitchen')).toBe(true);
    const payload = JSON.parse(notes[0].payload || '{}');
    expect(payload.officeName).toBe('Teknik Ofis');
    expect(payload.calledAt).toBeTruthy();

    const second = await request(app).post('/sessions/staff-call').set(authHeader(t)).send({});
    expect(second.status).toBe(429);
    expect(String(second.body.error || '')).toMatch(/bekleyin/i);
  });

  it('paralel staff-call — yalnız biri 200, diğeri 429', async () => {
    const t = await token();
    const [a, b] = await Promise.all([
      request(app).post('/sessions/staff-call').set(authHeader(t)).send({}),
      request(app).post('/sessions/staff-call').set(authHeader(t)).send({}),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 429]);
    const notes = await prisma.userNotification.count({
      where: { event: 'kitchen:staff_call' },
    });
    expect(notes).toBeGreaterThan(0);
  });

  it('Türk Kahvesi şeker seçimi zorunlu ve özet etiketi doğru', async () => {
    const t = await token();
    const opened = await request(app).post('/sessions').set(authHeader(t)).send({});
    const sid = opened.body.session.id;

    const missing = await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.turkishCoffee.id, qty: 1 });
    expect(missing.status).toBe(400);

    const bad = await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.turkishCoffee.id, qty: 1, note: 'Bol şeker' });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(t))
      .send({ menuItemId: fixtures.turkishCoffee.id, qty: 1, note: 'Orta Şekerli' });
    expect(ok.status).toBe(200);
    expect(ok.body.session.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Türk Kahvesi (Orta Şekerli)',
          qty: 1,
        }),
      ])
    );
  });
});

describe('RACE CONDITION', () => {
  let app;

  beforeAll(() => {
    app = getApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('paralel iki POST /sessions — yalnız biri başarılı', async () => {
    const login = await loginAs(request(app), 'yusuf');
    const t = login.body.token;
    const [a, b] = await Promise.all([
      request(app).post('/sessions').set(authHeader(t)).send({}),
      request(app).post('/sessions').set(authHeader(t)).send({}),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const collecting = await prisma.orderSession.count({
      where: { status: 'collecting', officeId: a.body.session?.officeId || b.body.session?.officeId },
    });
    expect(collecting).toBe(1);
  });
});
