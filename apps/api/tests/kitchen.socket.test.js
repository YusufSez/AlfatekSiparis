import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import http from 'http';
import { io as ioClient } from 'socket.io-client';
import { getApp, resetDb, loginAs, authHeader } from './helpers.js';
import { createSocketServer } from '../src/realtime/socket.js';
import { setSocketRuntime } from '../src/common/runtime.js';

function waitFor(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('KITCHEN + SOCKET', () => {
  let app;
  let server;
  let baseUrl;
  let fixtures;

  beforeAll(async () => {
    app = getApp();
    server = http.createServer(app);
    const io = createSocketServer(server, 'http://localhost:5173');
    setSocketRuntime(io);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(async () => {
    fixtures = await resetDb();
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('kitchen preparing → ready → delivered + socket events', async () => {
    const officeLogin = await loginAs(request(app), 'yusuf');
    const kitchenLogin = await loginAs(request(app), 'mutfak');
    const officeToken = officeLogin.body.token;
    const kitchenToken = kitchenLogin.body.token;

    const kitchenSocket = ioClient(baseUrl, {
      auth: { token: kitchenToken },
      transports: ['websocket'],
    });
    await waitFor(kitchenSocket, 'connected');

    const newTicketPromise = waitFor(kitchenSocket, 'kitchen:new_ticket');

    const opened = await request(app).post('/sessions').set(authHeader(officeToken)).send({});
    const sid = opened.body.session.id;
    await request(app)
      .post(`/sessions/${sid}/lines`)
      .set(authHeader(officeToken))
      .send({ menuItemId: fixtures.tea.id, qty: 3 });
    await request(app).post(`/sessions/${sid}/confirm`).set(authHeader(officeToken)).send({});

    const ticket = await newTicketPromise;
    expect(ticket.status).toBe('new');
    expect(ticket.summary.some((s) => s.qty === 3)).toBe(true);

    const updatedPromise = waitFor(kitchenSocket, 'kitchen:updated');
    const prep = await request(app)
      .patch(`/kitchen/tickets/${ticket.id}`)
      .set(authHeader(kitchenToken))
      .send({ status: 'preparing' });
    expect(prep.status).toBe(200);
    expect(prep.body.ticket.status).toBe('preparing');
    expect((await updatedPromise).status).toBe('preparing');

    const readyPromise = waitFor(kitchenSocket, 'kitchen:updated');
    const ready = await request(app)
      .patch(`/kitchen/tickets/${ticket.id}`)
      .set(authHeader(kitchenToken))
      .send({ status: 'ready' });
    expect(ready.body.ticket.status).toBe('ready');
    expect((await readyPromise).status).toBe('ready');

    const deliveredPromise = waitFor(kitchenSocket, 'kitchen:updated');
    const delivered = await request(app)
      .patch(`/kitchen/tickets/${ticket.id}`)
      .set(authHeader(kitchenToken))
      .send({ status: 'delivered' });
    expect(delivered.body.ticket.status).toBe('delivered');
    expect((await deliveredPromise).status).toBe('delivered');

    kitchenSocket.close();
  });
});
