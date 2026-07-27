export class MemoryPresenceProvider {
  constructor() {
    /** @type {Map<string, Map<string, { id: string, name: string, socketIds: Set<string> }>>} */
    this.byOffice = new Map();
    /** @type {Map<string, { userId: string, officeId: string|null }>} */
    this.socketIndex = new Map();
  }

  async upsert({ officeId, userId, name, socketId }) {
    if (!officeId) return;
    if (!this.byOffice.has(officeId)) this.byOffice.set(officeId, new Map());
    const officeMap = this.byOffice.get(officeId);
    const existing = officeMap.get(userId) || { id: userId, name, socketIds: new Set() };
    existing.name = name;
    existing.socketIds.add(socketId);
    officeMap.set(userId, existing);
    this.socketIndex.set(socketId, { userId, officeId });
  }

  async removeSocket(socketId) {
    const info = this.socketIndex.get(socketId);
    if (!info) return null;
    this.socketIndex.delete(socketId);
    const officeMap = this.byOffice.get(info.officeId);
    if (!officeMap) return info.officeId;
    const user = officeMap.get(info.userId);
    if (!user) return info.officeId;
    user.socketIds.delete(socketId);
    if (user.socketIds.size === 0) officeMap.delete(info.userId);
    return info.officeId;
  }

  async listOnline(officeId) {
    const officeMap = this.byOffice.get(officeId);
    if (!officeMap) return [];
    return [...officeMap.values()].map((u) => ({ id: u.id, name: u.name, online: true }));
  }
}

export class PresenceService {
  constructor(provider) {
    this.provider = provider;
  }

  upsert(args) {
    return this.provider.upsert(args);
  }

  removeSocket(socketId) {
    return this.provider.removeSocket(socketId);
  }

  listOnline(officeId) {
    return this.provider.listOnline(officeId);
  }
}

export const presenceService = new PresenceService(new MemoryPresenceProvider());
