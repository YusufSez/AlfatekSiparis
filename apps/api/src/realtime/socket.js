import { Server } from 'socket.io';
import { verifyToken } from '../common/auth.js';
import { prisma } from '../common/db.js';
import { logger } from '../common/logger.js';
import { buildSocketCorsOrigin } from '../common/corsOrigin.js';
import { notificationService } from '../modules/notifications/notification.service.js';
import { presenceService } from '../modules/presence/presence.service.js';
import { getPresenceForOffice } from '../modules/orders/orders.domain.js';
import { SocketEvents } from '../common/sessionEventType.js';

export function createSocketServer(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: {
      origin: buildSocketCorsOrigin(corsOrigin),
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
  });

  notificationService.setSocket(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Yetkisiz'));
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.active || user.deletedAt) return next(new Error('Yetkisiz'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Yetkisiz'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    socket.join(`user:${user.id}`);
    if (user.officeId) socket.join(`office:${user.officeId}`);
    if (user.role === 'kitchen' || user.role === 'admin') socket.join('kitchen');
    if (user.role === 'admin') socket.join('admins');

    if (user.officeId) {
      await presenceService.upsert({
        officeId: user.officeId,
        userId: user.id,
        name: user.name,
        socketId: socket.id,
      });
      const users = await getPresenceForOffice(user.officeId);
      await notificationService.notify({
        rooms: [`office:${user.officeId}`, 'admins'],
        event: SocketEvents.PRESENCE_UPDATE,
        payload: { officeId: user.officeId, users },
      });
    }

    socket.emit('connected', { userId: user.id, role: user.role });
    logger.info('socket.connected', { userId: user.id, socketId: socket.id });

    socket.on('disconnect', async () => {
      const officeId = await presenceService.removeSocket(socket.id);
      if (officeId) {
        const users = await getPresenceForOffice(officeId);
        await notificationService.notify({
          rooms: [`office:${officeId}`, 'admins'],
          event: SocketEvents.PRESENCE_UPDATE,
          payload: { officeId, users },
        });
      }
      logger.info('socket.disconnected', { userId: user.id, socketId: socket.id });
    });
  });

  return io;
}
