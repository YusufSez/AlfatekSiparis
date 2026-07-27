import { prisma } from '../../common/db.js';

export function sessionInclude() {
  return {
    office: true,
    openedBy: { select: { id: true, name: true, username: true } },
    lines: {
      include: {
        user: { select: { id: true, name: true, username: true } },
        menuItem: true,
      },
      orderBy: { createdAt: 'asc' },
    },
    skips: {
      include: {
        user: { select: { id: true, name: true, username: true } },
      },
    },
  };
}

export const ordersRepository = {
  findSession(id) {
    return prisma.orderSession.findUnique({ where: { id }, include: sessionInclude() });
  },
  findCollecting(officeId) {
    return prisma.orderSession.findFirst({
      where: { officeId, status: 'collecting' },
      include: sessionInclude(),
    });
  },
  listEvents(sessionId) {
    return prisma.sessionEvent.findMany({
      where: { sessionId },
      include: { actor: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },
};
