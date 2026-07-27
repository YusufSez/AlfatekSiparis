import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryPresenceProvider,
  PresenceService,
} from '../src/modules/presence/presence.service.js';

describe('PRESENCE', () => {
  let provider;
  let service;

  beforeEach(() => {
    provider = new MemoryPresenceProvider();
    service = new PresenceService(provider);
  });

  it('connect — upsert online listesine ekler', async () => {
    await service.upsert({
      officeId: 'o1',
      userId: 'u1',
      name: 'Yusuf',
      socketId: 's1',
    });
    const online = await service.listOnline('o1');
    expect(online).toEqual([{ id: 'u1', name: 'Yusuf', online: true }]);
  });

  it('disconnect — son socket gidince offline', async () => {
    await service.upsert({
      officeId: 'o1',
      userId: 'u1',
      name: 'Yusuf',
      socketId: 's1',
    });
    await service.removeSocket('s1');
    expect(await service.listOnline('o1')).toEqual([]);
  });

  it('çoklu sekme / çoklu socket — son sockete kadar online', async () => {
    await service.upsert({
      officeId: 'o1',
      userId: 'u1',
      name: 'Yusuf',
      socketId: 'tab-a',
    });
    await service.upsert({
      officeId: 'o1',
      userId: 'u1',
      name: 'Yusuf',
      socketId: 'tab-b',
    });
    expect((await service.listOnline('o1')).length).toBe(1);

    await service.removeSocket('tab-a');
    expect((await service.listOnline('o1')).length).toBe(1);

    await service.removeSocket('tab-b');
    expect((await service.listOnline('o1')).length).toBe(0);
  });

  it('farklı kullanıcılar aynı ofiste', async () => {
    await service.upsert({
      officeId: 'o1',
      userId: 'u1',
      name: 'Yusuf',
      socketId: 's1',
    });
    await service.upsert({
      officeId: 'o1',
      userId: 'u2',
      name: 'Ahmet',
      socketId: 's2',
    });
    expect((await service.listOnline('o1')).length).toBe(2);
  });
});
