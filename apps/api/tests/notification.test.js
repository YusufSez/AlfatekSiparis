import { describe, it, expect, vi } from 'vitest';
import {
  NotificationService,
  SocketAdapter,
} from '../src/modules/notifications/notification.service.js';

describe('NOTIFICATION', () => {
  it('NotificationService adapter.send çağırır', async () => {
    const send = vi.fn(async () => {});
    const adapter = { send };
    const service = new NotificationService([adapter]);
    await service.notify({
      rooms: ['office:1'],
      event: 'session:opened',
      payload: { id: 's1' },
      requestId: 'r1',
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].event).toBe('session:opened');
    expect(send.mock.calls[0][0].payload.requestId).toBe('r1');
    expect(send.mock.calls[0][0].rooms).toEqual(['office:1']);
  });

  it('null payload session sentinel korunur', async () => {
    const send = vi.fn(async () => {});
    const service = new NotificationService([{ send }]);
    await service.notify({
      rooms: ['office:1'],
      event: 'session:updated',
      payload: null,
      requestId: 'r2',
    });
    expect(send.mock.calls[0][0].payload).toEqual({ session: null, requestId: 'r2' });
  });

  it('SocketAdapter broadcast ve room emit', async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { emit, to };
    const adapter = new SocketAdapter(io);
    await adapter.send({
      broadcast: true,
      event: 'announcement:updated',
      payload: { ok: 1 },
    });
    expect(emit).toHaveBeenCalledWith('announcement:updated', { ok: 1 });

    await adapter.send({
      rooms: ['kitchen'],
      event: 'kitchen:updated',
      payload: { id: 1 },
    });
    expect(to).toHaveBeenCalledWith(['kitchen']);

    to.mockClear();
    emit.mockClear();
    await adapter.send({
      rooms: ['kitchen', 'admins', 'kitchen'],
      event: 'kitchen:new_ticket',
      payload: { id: 2 },
    });
    // Union emit once — admin in both rooms receives a single delivery
    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(['kitchen', 'admins']);
    expect(emit).toHaveBeenCalledWith('kitchen:new_ticket', { id: 2 });
  });
});
