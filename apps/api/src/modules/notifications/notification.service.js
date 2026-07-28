import {
  configureVapid,
  getVapidPublicKey,
  isPushConfigured,
  sendPushToUser,
  sendPushToUsers,
  sendPushToRole,
  sendPushToAll,
} from './push.service.js';

export class SocketAdapter {
  constructor(io) {
    this.io = io;
  }

  async send({ rooms = [], event, payload, broadcast = false }) {
    if (!this.io) return;
    if (broadcast) {
      this.io.emit(event, payload);
      return;
    }
    for (const room of rooms) {
      this.io.to(room).emit(event, payload);
    }
  }
}

export class NotificationService {
  constructor(adapters = []) {
    this.adapters = adapters;
    configureVapid();
  }

  setSocket(io) {
    const socket = this.adapters.find((a) => a instanceof SocketAdapter);
    if (socket) socket.io = io;
    else this.adapters.push(new SocketAdapter(io));
  }

  async notify({ rooms, event, payload, requestId, broadcast = false }) {
    const body =
      payload == null
        ? { session: null, requestId: requestId || null }
        : { ...payload, requestId: requestId || payload?.requestId };
    await Promise.all(
      this.adapters.map((adapter) =>
        adapter.send({ rooms, event, payload: body, broadcast })
      )
    );
  }

  getVapidPublicKey() {
    return getVapidPublicKey();
  }

  isPushConfigured() {
    return isPushConfigured();
  }

  sendPushToUser(userId, note) {
    return sendPushToUser(userId, note);
  }

  sendPushToUsers(userIds, note) {
    return sendPushToUsers(userIds, note);
  }

  sendPushToRole(role, note) {
    return sendPushToRole(role, note);
  }

  sendPushToAll(note) {
    return sendPushToAll(note);
  }
}

export const notificationService = new NotificationService([new SocketAdapter(null)]);
