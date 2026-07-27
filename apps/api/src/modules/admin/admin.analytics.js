import { prisma } from '../../common/db.js';
import { presenceService } from '../presence/presence.service.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const x = startOfDay();
  x.setDate(x.getDate() - n);
  return x;
}

export async function getDashboardStats() {
  const today = startOfDay();
  const offices = await prisma.office.findMany({ orderBy: { name: 'asc' } });

  const [
    todaySessions,
    activeCollecting,
    deliveredToday,
    totalUsers,
    ticketsToday,
  ] = await Promise.all([
    prisma.orderSession.count({
      where: { createdAt: { gte: today }, status: { in: ['sent', 'closed'] } },
    }),
    prisma.orderSession.count({ where: { status: 'collecting' } }),
    prisma.sessionEvent.count({
      where: { type: 'ticket.delivered', createdAt: { gte: today } },
    }),
    prisma.user.count({ where: { active: true } }),
    prisma.kitchenTicket.findMany({
      where: { createdAt: { gte: today } },
      select: {
        summaryJson: true,
        status: true,
        createdAt: true,
        officeId: true,
      },
    }),
  ]);

  let onlineTotal = 0;
  const onlineByOffice = {};
  for (const o of offices) {
    const online = await presenceService.listOnline(o.id);
    onlineByOffice[o.name] = online.length;
    onlineTotal += online.length;
  }

  const productTotals = new Map();
  for (const t of ticketsToday) {
    const summary = JSON.parse(t.summaryJson);
    for (const s of summary) {
      productTotals.set(s.name, (productTotals.get(s.name) || 0) + s.qty);
    }
  }

  const productDistribution = [...productTotals.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);

  const topProduct = productDistribution[0] || null;
  const teaTotal = productTotals.get('Çay') || 0;
  const sodaTotal = productTotals.get('Soda') || 0;

  const prepEvents = await prisma.sessionEvent.findMany({
    where: {
      type: { in: ['ticket.preparing', 'ticket.delivered'] },
      createdAt: { gte: daysAgo(7) },
    },
    select: { sessionId: true, type: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  });

  /** SessionEvent zamanlarına göre hazırlanma süresi (sent → delivered) */
  const bySession = new Map();
  for (const ev of prepEvents) {
    if (!bySession.has(ev.sessionId)) bySession.set(ev.sessionId, {});
    const row = bySession.get(ev.sessionId);
    if (ev.type === 'ticket.preparing' && !row.preparingAt) row.preparingAt = ev.createdAt;
    if (ev.type === 'ticket.delivered' && !row.deliveredAt) row.deliveredAt = ev.createdAt;
  }

  const sentEvents = await prisma.sessionEvent.findMany({
    where: {
      type: 'session.sent',
      sessionId: { in: [...bySession.keys()] },
    },
    select: { sessionId: true, createdAt: true },
  });
  const sentAt = new Map(sentEvents.map((e) => [e.sessionId, e.createdAt]));

  const prepMinutes = [];
  for (const [sessionId, times] of bySession) {
    const start = sentAt.get(sessionId) || times.preparingAt;
    const end = times.deliveredAt;
    if (!start || !end) continue;
    const mins = (new Date(end) - new Date(start)) / 60000;
    if (mins >= 0 && mins < 240) prepMinutes.push(mins);
  }
  const avgPrepMinutes =
    prepMinutes.length === 0
      ? 0
      : Math.round((prepMinutes.reduce((a, b) => a + b, 0) / prepMinutes.length) * 10) / 10;

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = daysAgo(i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const count = await prisma.orderSession.count({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd },
        status: { in: ['sent', 'closed'] },
      },
    });
    last7.push({
      date: dayStart.toISOString().slice(0, 10),
      label: dayStart.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }),
      count,
    });
  }

  const byOffice = [];
  for (const o of offices) {
    const count = await prisma.orderSession.count({
      where: {
        officeId: o.id,
        createdAt: { gte: daysAgo(7) },
        status: { in: ['sent', 'closed'] },
      },
    });
    byOffice.push({ officeId: o.id, name: o.name, color: o.color, count });
  }

  return {
    cards: {
      todayOrders: todaySessions,
      activeOrders: activeCollecting,
      deliveredToday,
      totalUsers,
      onlineUsers: onlineTotal,
      onlineByOffice,
      teaTotal,
      sodaTotal,
      topProduct,
      avgPrepMinutes,
    },
    charts: {
      last7Days: last7,
      productDistribution,
      byOffice,
    },
  };
}

export async function globalSearch(q) {
  const query = q.trim();
  if (!query || query.length < 2) {
    return {
      users: [],
      offices: [],
      sessions: [],
      logs: [],
      notifications: [],
      tickets: [],
      announcements: [],
    };
  }

  const [users, offices, sessions, logs, notifications, tickets, announcements] =
    await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { username: { contains: query } },
          ],
        },
        take: 10,
        include: { office: true },
      }),
      prisma.office.findMany({
        where: { name: { contains: query } },
        take: 10,
      }),
      prisma.orderSession.findMany({
        where: {
          OR: [
            { id: { contains: query } },
            { openedBy: { name: { contains: query } } },
            { office: { name: { contains: query } } },
          ],
        },
        take: 10,
        include: {
          office: true,
          openedBy: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: {
          OR: [{ action: { contains: query } }, { payload: { contains: query } }],
        },
        take: 10,
        include: { actor: { select: { id: true, name: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.userNotification.findMany({
        where: {
          OR: [
            { title: { contains: query } },
            { body: { contains: query } },
            { event: { contains: query } },
          ],
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.kitchenTicket.findMany({
        where: {
          OR: [
            { id: { contains: query } },
            { summaryJson: { contains: query } },
            { detailsJson: { contains: query } },
            { office: { name: { contains: query } } },
          ],
        },
        take: 10,
        include: { office: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.announcement.findMany({
        where: {
          OR: [{ title: { contains: query } }, { body: { contains: query } }],
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      office: u.office?.name || null,
      active: u.active,
    })),
    offices: offices.map((o) => ({ id: o.id, name: o.name, color: o.color })),
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      office: s.office.name,
      openedBy: s.openedBy.name,
      createdAt: s.createdAt,
    })),
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      actor: l.actor?.name || null,
      createdAt: l.createdAt,
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
    })),
    tickets: tickets.map((t) => ({
      id: t.id,
      status: t.status,
      office: t.office.name,
      summary: JSON.parse(t.summaryJson),
      createdAt: t.createdAt,
    })),
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      active: a.active,
      severity: a.severity,
    })),
  };
}
