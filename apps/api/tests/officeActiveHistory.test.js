import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp, resetDb, loginAs, authHeader, prisma } from './helpers.js';
import { scheduleKitchenResponseTimeout } from '../src/modules/orders/orders.domain.js';

async function flushAsync(ms = 80) {
  await new Promise((r) => setTimeout(r, ms));
}

describe('office active vs history + kitchen response timeout', () => {
  let app;
  let fixtures;

  beforeAll(() => {
    app = getApp();
  });

  beforeEach(async () => {
    fixtures = await resetDb();
  });

  async function openAndConfirm(token) {
    const opened = await request(app).post('/sessions').set(authHeader(token)).send({});
    expect(opened.status).toBe(201);
    const sid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(token))
      .send({ menuItemId: fixtures.tea.id, qty: 1 });
    const conf = await request(app)
      .post(`/sessions/${sid}/confirm`)
      .set(authHeader(token))
      .send({});
    expect(conf.status).toBe(200);
    const ticket = await prisma.kitchenTicket.findUnique({ where: { sessionId: sid } });
    expect(ticket).toBeTruthy();
    return { sid, ticket };
  }

  it('GET /sessions/active returns in-flight ticket after send (not history)', async () => {
    const tYusuf = (await loginAs(request(app), 'yusuf')).body.token;
    const { ticket } = await openAndConfirm(tYusuf);

    const active = await request(app).get('/sessions/active').set(authHeader(tYusuf));
    expect(active.status).toBe(200);
    expect(active.body.session).toBeNull();
    expect(active.body.activeTicket?.id).toBe(ticket.id);
    expect(active.body.activeTicket?.status).toBe('new');

    const history = await request(app).get('/sessions/history').set(authHeader(tYusuf));
    expect(history.status).toBe(200);
    expect(history.body.entries || []).toHaveLength(0);
    expect(history.body.tickets || []).toHaveLength(0);
  });

  it('history only includes delivered tickets and cancelled sessions', async () => {
    const tYusuf = (await loginAs(request(app), 'yusuf')).body.token;
    const tKitchen = (await loginAs(request(app), 'mutfak')).body.token;

    const { ticket } = await openAndConfirm(tYusuf);
    await request(app)
      .patch(`/kitchen/tickets/${ticket.id}`)
      .set(authHeader(tKitchen))
      .send({ status: 'preparing' });
    await request(app)
      .patch(`/kitchen/tickets/${ticket.id}`)
      .set(authHeader(tKitchen))
      .send({ status: 'delivered' });

    // Cancelled collecting session (no ticket)
    const opened = await request(app).post('/sessions').set(authHeader(tYusuf)).send({});
    const cancelSid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${cancelSid}/close`)
      .set(authHeader(tYusuf))
      .send({});

    const history = await request(app).get('/sessions/history').set(authHeader(tYusuf));
    expect(history.status).toBe(200);
    const kinds = (history.body.entries || []).map((e) => e.kind).sort();
    expect(kinds).toEqual(['cancelled', 'delivered']);
    expect(history.body.tickets).toHaveLength(1);
    expect(history.body.tickets[0].status).toBe('delivered');
  });

  it('kitchen response timeout notifies opener once; preparing cancels timeout', async () => {
    const tYusuf = (await loginAs(request(app), 'yusuf')).body.token;
    const tKitchen = (await loginAs(request(app), 'mutfak')).body.token;

    const { ticket } = await openAndConfirm(tYusuf);
    const past = new Date(Date.now() - 10 * 60_000);
    await prisma.kitchenTicket.update({
      where: { id: ticket.id },
      data: { createdAt: past },
    });

    scheduleKitchenResponseTimeout(ticket.id, past, 5);
    await flushAsync();

    const notes = await prisma.userNotification.findMany({
      where: { userId: fixtures.yusuf.id, event: 'ticket.kitchen_no_response' },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe('Mutfak siparişinize henüz yanıt vermedi.');

    scheduleKitchenResponseTimeout(ticket.id, past, 5);
    await flushAsync();
    const count = await prisma.userNotification.count({
      where: { userId: fixtures.yusuf.id, event: 'ticket.kitchen_no_response' },
    });
    expect(count).toBe(1);

    // Fresh ticket: preparing before timeout → no notify
    const { ticket: ticket2 } = await openAndConfirm(tYusuf);
    await request(app)
      .patch(`/kitchen/tickets/${ticket2.id}`)
      .set(authHeader(tKitchen))
      .send({ status: 'preparing' });
    const past2 = new Date(Date.now() - 10 * 60_000);
    scheduleKitchenResponseTimeout(ticket2.id, past2, 5);
    await flushAsync();
    const events = await prisma.sessionEvent.count({
      where: { sessionId: ticket2.sessionId, type: 'ticket.kitchen_no_response' },
    });
    expect(events).toBe(0);
  });

  it('admin can set kitchenResponseMinutes (default 5)', async () => {
    const tAdmin = (await loginAs(request(app), 'admin')).body.token;
    const get1 = await request(app).get('/admin/settings').set(authHeader(tAdmin));
    expect(get1.status).toBe(200);
    expect(get1.body.settings.kitchenResponseMinutes).toBe(5);

    const patch = await request(app)
      .patch('/admin/settings')
      .set(authHeader(tAdmin))
      .send({ kitchenResponseMinutes: 8 });
    expect(patch.status).toBe(200);
    expect(patch.body.settings.kitchenResponseMinutes).toBe(8);

    const get2 = await request(app).get('/admin/settings').set(authHeader(tAdmin));
    expect(get2.body.settings.kitchenResponseMinutes).toBe(8);
  });
});
