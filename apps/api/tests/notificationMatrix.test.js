import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp, resetDb, loginAs, authHeader, prisma } from './helpers.js';

describe('notification matrix + office isolation', () => {
  let app;
  let fixtures;

  beforeAll(() => {
    app = getApp();
  });

  beforeEach(async () => {
    fixtures = await resetDb();
  });

  async function openConfirmAndPrep() {
    const tYusuf = (await loginAs(request(app), 'yusuf')).body.token;
    const tKitchen = (await loginAs(request(app), 'mutfak')).body.token;

    const opened = await request(app).post('/sessions').set(authHeader(tYusuf)).send({});
    expect(opened.status).toBe(201);
    const sid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(tYusuf))
      .send({ menuItemId: fixtures.tea.id, qty: 1 });
    const conf = await request(app)
      .post(`/sessions/${sid}/confirm`)
      .set(authHeader(tYusuf))
      .send({});
    expect(conf.status).toBe(200);

    const ticket = await prisma.kitchenTicket.findUnique({ where: { sessionId: sid } });
    expect(ticket).toBeTruthy();

    const prep = await request(app)
      .patch(`/kitchen/tickets/${ticket.id}`)
      .set(authHeader(tKitchen))
      .send({ status: 'preparing' });
    expect(prep.status).toBe(200);

    const delivered = await request(app)
      .patch(`/kitchen/tickets/${ticket.id}`)
      .set(authHeader(tKitchen))
      .send({ status: 'delivered' });
    expect(delivered.status).toBe(200);

    return { sid, ticketId: ticket.id };
  }

  it('ofis: open+preparing var; sent+delivered inbox yok', async () => {
    await openConfirmAndPrep();

    const yusufNotes = await prisma.userNotification.findMany({
      where: { userId: fixtures.yusuf.id },
      select: { event: true, title: true },
    });
    const events = yusufNotes.map((n) => n.event);

    // Opener excluded from session.opened by default (NOTIFY_SELF_ON_OPEN off)
    expect(events).not.toContain('session.sent');
    expect(events).not.toContain('ticket.delivered');
    expect(events).toContain('ticket.preparing');

    const ahmetNotes = await prisma.userNotification.findMany({
      where: { userId: fixtures.ahmet.id },
      select: { event: true },
    });
    const ahmetEvents = ahmetNotes.map((n) => n.event);
    expect(ahmetEvents).toContain('session.opened');
    expect(ahmetEvents).toContain('ticket.preparing');
    expect(ahmetEvents).not.toContain('session.sent');
    expect(ahmetEvents).not.toContain('ticket.delivered');
  });

  it('mutfak: ofis adıyla yeni sipariş bildirimi alır', async () => {
    await openConfirmAndPrep();

    const kitchenNotes = await prisma.userNotification.findMany({
      where: { userId: fixtures.kitchen.id, event: 'kitchen:new_ticket' },
    });
    expect(kitchenNotes.length).toBe(1);
    expect(kitchenNotes[0].title).toBe('Teknik Ofisten Yeni Sipariş');
    expect(kitchenNotes[0].body).toBe('Teknik Ofisten siparişiniz var.');
  });

  it('operasyon kullanıcısı teknik ofis bildirimlerini almaz', async () => {
    await openConfirmAndPrep();

    const muratNotes = await prisma.userNotification.findMany({
      where: { userId: fixtures.murat.id },
    });
    expect(muratNotes).toHaveLength(0);
  });

  it('operasyon siparişi mutfakta Operasyon Ofisinden metniyle bildirilir', async () => {
    const tMurat = (await loginAs(request(app), 'murat')).body.token;
    const opened = await request(app).post('/sessions').set(authHeader(tMurat)).send({});
    const sid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(tMurat))
      .send({ menuItemId: fixtures.tea.id, qty: 1 });
    await request(app).post(`/sessions/${sid}/confirm`).set(authHeader(tMurat)).send({});

    const kitchenNotes = await prisma.userNotification.findMany({
      where: { userId: fixtures.kitchen.id, event: 'kitchen:new_ticket' },
    });
    expect(kitchenNotes.some((n) => n.title === 'Operasyon Ofisinden Yeni Sipariş')).toBe(true);
    expect(kitchenNotes.some((n) => n.body === 'Operasyon Ofisinden siparişiniz var.')).toBe(true);

    // Teknik ofis kullanıcıları operasyon sipariş bildirimini almamalı
    const yusufNotes = await prisma.userNotification.count({
      where: { userId: fixtures.yusuf.id, event: 'kitchen:new_ticket' },
    });
    const ahmetNotes = await prisma.userNotification.count({
      where: { userId: fixtures.ahmet.id, event: 'kitchen:new_ticket' },
    });
    expect(yusufNotes).toBe(0);
    expect(ahmetNotes).toBe(0);
  });
});
