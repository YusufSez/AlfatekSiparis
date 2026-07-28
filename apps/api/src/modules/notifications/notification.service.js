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
  }

  setSocket(io) {
    const socket = this.adapters.find((a) => a instanceof SocketAdapter);
    if (socket) socket.io = io;
    else this.adapters.push(new SocketAdapter(io));
  }

  async notify({ rooms, event, payload, requestId, broadcast = false }) {
    // Preserve null sentinel (cleared session) — spreading null yields {}
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
}

export const notificationService = new NotificationService([new SocketAdapter(null)]);
