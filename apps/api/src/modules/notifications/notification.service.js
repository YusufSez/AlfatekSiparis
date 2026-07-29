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
    // Dedupe rooms so sockets in multiple rooms (e.g. admin in kitchen+admins)
    // receive each event once. Socket.IO v4: to([...]) is a union of rooms.
    const unique = [...new Set((rooms || []).filter(Boolean))];
    if (!unique.length) return;
    this.io.to(unique).emit(event, payload);
  }

  /** Force-disconnect all sockets for a user (delete / deactivate). */
  disconnectUser(userId) {
    if (!this.io || !userId) return;
    this.io.in(`user:${userId}`).disconnectSockets(true);
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

  disconnectUser(userId) {
    const socket = this.adapters.find((a) => a instanceof SocketAdapter);
    socket?.disconnectUser(userId);
  }
}

export const notificationService = new NotificationService([new SocketAdapter(null)]);
