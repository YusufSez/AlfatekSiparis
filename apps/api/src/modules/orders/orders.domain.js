import { prisma } from '../../common/db.js';
import { httpError } from '../../common/errors.js';
import { assertTransition } from '../../common/stateMachine.js';
import { SessionEventType, SocketEvents } from '../../common/sessionEventType.js';
import { logger } from '../../common/logger.js';
import { parseTicketSummaryJson } from '../../common/ticketSummary.js';
import { isNotificationEventAllowed } from '../notifications/notificationAudience.js';
import { notificationService } from '../notifications/notification.service.js';
import { presenceService } from '../presence/presence.service.js';
import { ordersRepository, sessionInclude } from './orders.repository.js';

async function writeAudit(actorId, action, payload, meta = {}) {
  await prisma.auditLog.create({
    data: {
      actorId: actorId ?? null,
      action,
      payload: JSON.stringify(payload),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      requestId: meta.requestId ?? null,
    },
  });
}

async function writeEvent(sessionId, type, actorId, payload, requestId) {
  await prisma.sessionEvent.create({
    data: {
      sessionId,
      type,
      actorId: actorId ?? null,
      payload: JSON.stringify(payload || {}),
      requestId: requestId ?? null,
    },
  });
}

async function activeUserIds({ role, roles, officeId, excludeIds = [] } = {}) {
  const roleFilter = roles?.length ? { in: roles } : role || undefined;
  const users = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(officeId ? { officeId } : {}),
    },
    select: { id: true },
  });
  const skip = new Set(excludeIds.filter(Boolean));
  return users.map((u) => u.id).filter((id) => !skip.has(id));
}

/** Non-admin office users may only act on sessions of their own office. */
function assertSessionOfficeAccess(user, session) {
  if (user.role === 'admin') return;
  if (!user.officeId || session.officeId !== user.officeId) {
    throw httpError(403, 'Bu ofise ait sipariş üzerinde işlem yapamazsınız');
  }
}

async function notifyUsers(userIds, { title, body, event, payload, url, tag, playSound = false } = {}) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length || !event) return;

  // Defense in depth: never write inbox/push for roles that must not see this event
  const recipients = await prisma.user.findMany({
    where: { id: { in: unique }, active: true, deletedAt: null },
    select: { id: true, role: true },
  });
  const allowedIds = recipients
    .filter((u) => isNotificationEventAllowed(u.role, event))
    .map((u) => u.id);
  if (!allowedIds.length) return;

  const p = payload && typeof payload === 'object' ? payload : {};
  const resolvedTag =
    tag ||
    (p.ticketId
      ? `order-${p.ticketId}-${p.status || event || 'evt'}`
      : p.sessionId
        ? `order-${p.sessionId}-${event || 'evt'}`
        : event || 'alfatek-notify');
  const shouldPlaySound = Boolean(playSound);

  await prisma.userNotification.createMany({
    data: allowedIds.map((userId) => ({
      userId,
      title,
      body,
      event,
      payload: JSON.stringify({ ...p, playSound: shouldPlaySound }),
    })),
  });
  for (const userId of allowedIds) {
    await notificationService.notify({
      rooms: [`user:${userId}`],
      event: SocketEvents.NOTIFICATION,
      payload: {
        title,
        body,
        event,
        payload: { ...p, playSound: shouldPlaySound },
        tag: resolvedTag,
        playSound: shouldPlaySound,
      },
    });
  }
  await notificationService.sendPushToUsers(allowedIds, {
    title,
    body,
    event,
    url: url || '/',
    tag: resolvedTag,
  }).catch((err) => {
    logger.warn('notifyUsers.push_failed', { message: err?.message });
  });
}

export async function serializeSession(session) {
  const participants = new Map();
  for (const line of session.lines) {
    if (line.qty <= 0) continue;
    if (!participants.has(line.userId)) {
      participants.set(line.userId, {
        id: line.user.id,
        name: line.user.name,
        username: line.user.username,
        avatarUrl: line.user.avatarUrl || null,
      });
    }
  }

  const skippedUsers = (session.skips || []).map((s) => ({
    id: s.user.id,
    name: s.user.name,
    username: s.user.username,
    avatarUrl: s.user.avatarUrl || null,
  }));
  const skippedIds = new Set(skippedUsers.map((u) => u.id));

  const summaryMap = new Map();
  for (const line of session.lines) {
    if (line.qty <= 0) continue;
    const key = line.menuItemId;
    const prev = summaryMap.get(key) || {
      menuItemId: line.menuItemId,
      name: line.menuItem.name,
      icon: line.menuItem.icon,
      qty: 0,
      notes: [],
    };
    prev.qty += line.qty;
    if (line.note) prev.notes.push({ userName: line.user.name, note: line.note });
    summaryMap.set(key, prev);
  }

  const officeUsers = await prisma.user.findMany({
    where: { officeId: session.officeId, role: 'office_user', active: true },
    select: { id: true, name: true, username: true, avatarUrl: true },
    orderBy: { name: 'asc' },
  });

  const online = await presenceService.listOnline(session.officeId);
  const onlineIds = new Set(online.map((u) => u.id));

  return {
    id: session.id,
    officeId: session.officeId,
    office: session.office,
    openedBy: session.openedBy,
    status: session.status,
    endsAt: session.endsAt,
    confirmedAt: session.confirmedAt,
    createdAt: session.createdAt,
    lines: session.lines.map((l) => ({
      id: l.id,
      userId: l.userId,
      user: l.user,
      menuItemId: l.menuItemId,
      menuItem: {
        id: l.menuItem.id,
        name: l.menuItem.name,
        icon: l.menuItem.icon,
      },
      qty: l.qty,
      note: l.note || null,
    })),
    participants: [...participants.values()],
    skippedUsers,
    pendingUsers: officeUsers.filter((u) => !participants.has(u.id) && !skippedIds.has(u.id)),
    presence: officeUsers.map((u) => ({
      ...u,
      online: onlineIds.has(u.id),
      response: participants.has(u.id)
        ? 'ordered'
        : skippedIds.has(u.id)
          ? 'skipped'
          : 'pending',
    })),
    summary: [...summaryMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    specialRequests: (session.specialRequests || [])
      .map((r) => ({
        userId: r.userId,
        userName: r.user?.name || null,
        note: r.note,
      }))
      .filter((r) => r.note),
  };
}

export function serializeTicket(ticket) {
  const { summary, specialRequests } = parseTicketSummaryJson(ticket.summaryJson);
  let details = [];
  try {
    const raw = JSON.parse(ticket.detailsJson || '[]');
    details = Array.isArray(raw) ? raw : [];
  } catch {
    details = [];
  }
  return {
    id: ticket.id,
    sessionId: ticket.sessionId,
    officeId: ticket.officeId,
    office: ticket.office,
    status: ticket.status,
    summary,
    details,
    specialRequests,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

/** Backward-compatible: array OR { items, specialRequests }. */
// parseTicketSummaryJson imported from common/ticketSummary.js

function buildTicketPayload(session) {
  const summaryMap = new Map();
  const details = [];
  for (const line of session.lines) {
    if (line.qty <= 0) continue;
    const key = line.menuItemId;
    const prev = summaryMap.get(key) || {
      menuItemId: line.menuItemId,
      name: line.menuItem.name,
      icon: line.menuItem.icon,
      qty: 0,
      notes: [],
    };
    prev.qty += line.qty;
    if (line.note) prev.notes.push({ userName: line.user.name, note: line.note });
    summaryMap.set(key, prev);
    details.push({
      userId: line.userId,
      userName: line.user.name,
      menuItemId: line.menuItemId,
      menuItemName: line.menuItem.name,
      icon: line.menuItem.icon,
      qty: line.qty,
      note: line.note || null,
    });
  }
  const specialRequests = (session.specialRequests || [])
    .map((r) => ({
      userId: r.userId,
      userName: r.user?.name || null,
      note: r.note,
    }))
    .filter((r) => r.note);
  return {
    summary: [...summaryMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    details,
    specialRequests,
  };
}

const pendingTimers = new Map();

function clearSessionTimer(sessionId) {
  const t = pendingTimers.get(sessionId);
  if (t) {
    clearTimeout(t);
    pendingTimers.delete(sessionId);
  }
}

export function scheduleSessionExpiry(sessionId, endsAt) {
  clearSessionTimer(sessionId);
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) {
    void finalizeSession(sessionId, 'timeout');
    return;
  }
  const timer = setTimeout(() => {
    void finalizeSession(sessionId, 'timeout');
  }, ms + 50);
  pendingTimers.set(sessionId, timer);
}

export async function restoreSessionTimers() {
  const active = await prisma.orderSession.findMany({ where: { status: 'collecting' } });
  for (const s of active) scheduleSessionExpiry(s.id, s.endsAt);
}

export async function getSettings() {
  const s = await prisma.appSetting.findUnique({ where: { id: 1 } });
  return {
    sessionDurationSec: s?.sessionDurationSec ?? 120,
    companyName: s?.companyName ?? 'Ofis Sipariş',
    notificationSound: s?.notificationSound ?? true,
    autoClose: s?.autoClose ?? true,
    workingHoursStart: s?.workingHoursStart ?? '08:00',
    workingHoursEnd: s?.workingHoursEnd ?? '19:00',
    config: JSON.parse(s?.config || '{}'),
  };
}

export async function openSession(user, meta = {}) {
  if (user.role !== 'office_user' || !user.officeId) {
    throw httpError(403, 'Sadece ofis kullanıcıları sipariş açabilir');
  }

  const settings = await getSettings();
  const endsAt = new Date(Date.now() + settings.sessionDurationSec * 1000);

  let session;
  try {
    session = await prisma.$transaction(async (tx) => {
      const office = await tx.office.findUnique({ where: { id: user.officeId } });
      if (!office) throw httpError(404, 'Ofis bulunamadı');
      if (office.activeCollectingSessionId) {
        const existing = await tx.orderSession.findUnique({
          where: { id: office.activeCollectingSessionId },
          include: sessionInclude(),
        });
        const err = httpError(409, 'Bu ofiste zaten aktif bir sipariş var');
        // Serialize after commit — only attach raw session; caller hydrates
        err._rawSession = existing;
        throw err;
      }

      const created = await tx.orderSession.create({
        data: {
          officeId: user.officeId,
          openedById: user.id,
          status: 'collecting',
          endsAt,
        },
        include: sessionInclude(),
      });

      await tx.office.update({
        where: { id: user.officeId },
        data: { activeCollectingSessionId: created.id },
      });

      return created;
    });
  } catch (err) {
    if (err.status === 409) {
      if (err._rawSession) {
        err.session = await serializeSession(err._rawSession);
        delete err._rawSession;
      }
      throw err;
    }
    const existing = await ordersRepository.findCollecting(user.officeId);
    if (existing) {
      throw Object.assign(httpError(409, 'Bu ofiste zaten aktif bir sipariş var'), {
        session: await serializeSession(existing),
      });
    }
    throw err;
  }

  await writeEvent(session.id, SessionEventType.OPENED, user.id, { endsAt }, meta.requestId);
  await writeAudit(user.id, SessionEventType.OPENED, { sessionId: session.id }, meta);
  scheduleSessionExpiry(session.id, endsAt);

  const payload = await serializeSession(session);
  await notificationService.notify({
    rooms: [`office:${user.officeId}`],
    event: SocketEvents.SESSION_OPENED,
    payload,
    requestId: meta.requestId,
  });
  await notificationService.notify({
    rooms: [`office:${user.officeId}`],
    event: SocketEvents.SESSION_UPDATED,
    payload,
    requestId: meta.requestId,
  });

  // Peers only — opener must not get inbox/sound for own open
  const peerIds = await activeUserIds({
    officeId: user.officeId,
    role: 'office_user',
    excludeIds: [user.id],
  });
  await notifyUsers(peerIds, {
    title: 'Yeni sipariş',
    body: `${user.name} yeni sipariş oluşturdu`,
    event: SessionEventType.OPENED,
    payload: { sessionId: session.id, openedById: user.id },
    url: '/office',
    tag: `session-open-${session.id}`,
    playSound: true,
  });

  logger.info('session.opened', { sessionId: session.id, requestId: meta.requestId });
  return payload;
}

export async function upsertLine(user, sessionId, menuItemId, qty, meta = {}, note = null) {
  if (user.role !== 'office_user' || !user.officeId) {
    throw httpError(403, 'Sadece ofis kullanıcıları sipariş verebilir');
  }

  const session = await prisma.orderSession.findUnique({ where: { id: sessionId } });
  if (!session || session.officeId !== user.officeId) {
    throw httpError(404, 'Sipariş oturumu bulunamadı');
  }
  if (session.status !== 'collecting') {
    throw httpError(400, 'Bu sipariş artık toplanmıyor');
  }
  if (new Date(session.endsAt).getTime() <= Date.now()) {
    await finalizeSession(sessionId, 'timeout', null, meta);
    throw httpError(400, 'Sipariş süresi doldu');
  }

  const menuItem = await prisma.menuItem.findFirst({
    where: { id: menuItemId, active: true },
  });
  if (!menuItem) throw httpError(404, 'Menü ürünü bulunamadı');

  const safeQty = Math.max(0, Math.min(20, Number(qty) || 0));
  const trimmedNote =
    typeof note === 'string' && note.trim() ? note.trim().slice(0, 120) : null;

  const isOther =
    menuItem.icon === 'other' || menuItem.name.toLocaleLowerCase('tr') === 'diğer';
  if (safeQty > 0 && isOther && !trimmedNote) {
    throw httpError(400, 'Diğer için açıklama yazın');
  }

  const stillOpen = await prisma.orderSession.findFirst({
    where: { id: sessionId, status: 'collecting', officeId: user.officeId },
  });
  if (!stillOpen) throw httpError(400, 'Bu sipariş artık toplanmıyor');

  if (safeQty === 0) {
    const deleted = await prisma.orderLine.deleteMany({
      where: {
        sessionId,
        userId: user.id,
        menuItemId,
        session: { status: 'collecting' },
      },
    });
    if (deleted.count === 0) {
      const check = await prisma.orderSession.findUnique({ where: { id: sessionId } });
      if (!check || check.status !== 'collecting') {
        throw httpError(400, 'Bu sipariş artık toplanmıyor');
      }
    }
    await writeEvent(
      sessionId,
      SessionEventType.LINE_REMOVED,
      user.id,
      { menuItemId, menuItemName: menuItem.name },
      meta.requestId
    );
  } else {
    await prisma.$transaction(async (tx) => {
      const live = await tx.orderSession.findFirst({
        where: { id: sessionId, status: 'collecting' },
      });
      if (!live) throw httpError(400, 'Bu sipariş artık toplanmıyor');
      await tx.sessionSkip.deleteMany({ where: { sessionId, userId: user.id } });
      await tx.orderLine.upsert({
        where: {
          sessionId_userId_menuItemId: { sessionId, userId: user.id, menuItemId },
        },
        create: {
          sessionId,
          userId: user.id,
          menuItemId,
          qty: safeQty,
          note: trimmedNote,
        },
        update: { qty: safeQty, note: trimmedNote },
      });
    });
    await writeEvent(
      sessionId,
      SessionEventType.LINE_UPSERTED,
      user.id,
      {
        menuItemId,
        menuItemName: menuItem.name,
        qty: safeQty,
        note: trimmedNote,
      },
      meta.requestId
    );
  }

  await writeAudit(
    user.id,
    safeQty === 0 ? SessionEventType.LINE_REMOVED : SessionEventType.LINE_UPSERTED,
    { sessionId, menuItemId, qty: safeQty, note: trimmedNote },
    meta
  );

  const fresh = await ordersRepository.findSession(sessionId);
  if (!fresh || fresh.status !== 'collecting') {
    throw httpError(400, 'Bu sipariş artık toplanmıyor');
  }
  const payload = await serializeSession(fresh);
  await notificationService.notify({
    rooms: [`office:${user.officeId}`],
    event: SocketEvents.SESSION_UPDATED,
    payload,
    requestId: meta.requestId,
  });
  return payload;
}

export async function leaveSession(user, sessionId, meta = {}) {
  if (user.role !== 'office_user' || !user.officeId) {
    throw httpError(403, 'Yetkisiz');
  }
  const session = await prisma.orderSession.findUnique({ where: { id: sessionId } });
  if (!session || session.officeId !== user.officeId || session.status !== 'collecting') {
    throw httpError(404, 'Aktif sipariş bulunamadı');
  }
  if (session.openedById === user.id) {
    throw httpError(400, 'Siparişi açan kişi çıkamaz; onaylayın veya oturumu kapatın');
  }

  await prisma.$transaction(async (tx) => {
    const live = await tx.orderSession.findFirst({
      where: { id: sessionId, status: 'collecting' },
    });
    if (!live) throw httpError(400, 'Bu sipariş artık toplanmıyor');
    await tx.orderLine.deleteMany({ where: { sessionId, userId: user.id } });
    await tx.sessionSkip.deleteMany({ where: { sessionId, userId: user.id } });
    await tx.sessionSpecialRequest.deleteMany({ where: { sessionId, userId: user.id } });
  });
  await writeEvent(sessionId, SessionEventType.LEFT, user.id, {}, meta.requestId);
  await writeAudit(user.id, SessionEventType.LEFT, { sessionId }, meta);

  const fresh = await ordersRepository.findSession(sessionId);
  const payload = await serializeSession(fresh);
  await notificationService.notify({
    rooms: [`office:${user.officeId}`],
    event: SocketEvents.SESSION_UPDATED,
    payload,
    requestId: meta.requestId,
  });
  return payload;
}

export async function confirmSession(user, sessionId, meta = {}) {
  const session = await prisma.orderSession.findUnique({ where: { id: sessionId } });
  if (!session) throw httpError(404, 'Sipariş oturumu bulunamadı');
  assertSessionOfficeAccess(user, session);
  if (session.openedById !== user.id && user.role !== 'admin') {
    throw httpError(403, 'Sadece siparişi açan kişi onaylayabilir');
  }
  if (session.status !== 'collecting') {
    throw httpError(400, 'Bu sipariş zaten kapatılmış veya gönderilmiş');
  }
  const result = await finalizeSession(sessionId, 'confirm', user.id, meta);
  if (!result) throw httpError(409, 'Sipariş başka bir işlem tarafından kapatıldı');
  return result;
}

/** Opener cancels collecting session — no kitchen ticket */
export async function cancelSession(user, sessionId, meta = {}) {
  const session = await prisma.orderSession.findUnique({
    where: { id: sessionId },
    include: { openedBy: { select: { id: true, name: true } } },
  });
  if (!session) throw httpError(404, 'Sipariş oturumu bulunamadı');
  assertSessionOfficeAccess(user, session);
  if (session.openedById !== user.id && user.role !== 'admin') {
    throw httpError(403, 'Sadece siparişi açan kişi oturumu kapatabilir');
  }
  if (session.status !== 'collecting') {
    throw httpError(400, 'Bu sipariş zaten kapatılmış veya gönderilmiş');
  }

  clearSessionTimer(sessionId);
  assertTransition('session', 'collecting', 'closed');

  const closed = await prisma.$transaction(async (tx) => {
    const updated = await claimCollectingSession(tx, sessionId, 'closed');
    if (!updated) return null;
    await tx.office.update({
      where: { id: session.officeId },
      data: { activeCollectingSessionId: null },
    });
    return updated;
  });
  if (!closed) throw httpError(409, 'Sipariş başka bir işlem tarafından kapatıldı');

  const actorName = session.openedBy?.name || user.name || 'Bir kullanıcı';
  await writeEvent(
    sessionId,
    SessionEventType.CLOSED,
    user.id,
    { reason: 'cancel', message: `${actorName} siparişi iptal etti.` },
    meta.requestId
  );
  await writeAudit(user.id, SessionEventType.CLOSED, { sessionId, reason: 'cancel' }, meta);

  const officeUserIds = await activeUserIds({
    officeId: session.officeId,
    role: 'office_user',
  });
  await notifyUsers(officeUserIds, {
    title: 'Sipariş iptal edildi',
    body: `${actorName} siparişi iptal etti.`,
    event: SessionEventType.CLOSED,
    payload: { sessionId, reason: 'cancel' },
    url: '/office',
  });

  const payload = await serializeSession(closed);
  await notificationService.notify({
    rooms: [`office:${session.officeId}`],
    event: SocketEvents.SESSION_CLOSED,
    payload,
    requestId: meta.requestId,
  });
  await notificationService.notify({
    rooms: [`office:${session.officeId}`],
    event: SocketEvents.SESSION_UPDATED,
    payload: null,
    requestId: meta.requestId,
  });
  logger.info('session.cancelled', { sessionId, requestId: meta.requestId });
  return payload;
}

/** User marks "İsteğim yok" — counts as responded, no order lines */
export async function skipSession(user, sessionId, meta = {}) {
  if (user.role !== 'office_user' || !user.officeId) {
    throw httpError(403, 'Yetkisiz');
  }
  const session = await prisma.orderSession.findUnique({ where: { id: sessionId } });
  if (!session || session.officeId !== user.officeId || session.status !== 'collecting') {
    throw httpError(404, 'Aktif sipariş bulunamadı');
  }
  if (new Date(session.endsAt).getTime() <= Date.now()) {
    await finalizeSession(sessionId, 'timeout', null, meta);
    throw httpError(400, 'Sipariş süresi doldu');
  }

  await prisma.$transaction(async (tx) => {
    const live = await tx.orderSession.findFirst({
      where: { id: sessionId, status: 'collecting' },
    });
    if (!live) throw httpError(400, 'Bu sipariş artık toplanmıyor');
    await tx.orderLine.deleteMany({ where: { sessionId, userId: user.id } });
    await tx.sessionSpecialRequest.deleteMany({ where: { sessionId, userId: user.id } });
    await tx.sessionSkip.upsert({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      create: { sessionId, userId: user.id },
      update: {},
    });
  });

  await writeEvent(sessionId, SessionEventType.SKIPPED, user.id, {}, meta.requestId);
  await writeAudit(user.id, SessionEventType.SKIPPED, { sessionId }, meta);

  const fresh = await ordersRepository.findSession(sessionId);
  const payload = await serializeSession(fresh);
  await notificationService.notify({
    rooms: [`office:${user.officeId}`],
    event: SocketEvents.SESSION_UPDATED,
    payload,
    requestId: meta.requestId,
  });
  return payload;
}

async function claimCollectingSession(tx, sessionId, nextStatus) {
  const claimed = await tx.orderSession.updateMany({
    where: { id: sessionId, status: 'collecting' },
    data: { status: nextStatus, confirmedAt: new Date() },
  });
  if (claimed.count === 0) return null;
  return tx.orderSession.findUnique({
    where: { id: sessionId },
    include: sessionInclude(),
  });
}

export async function finalizeSession(sessionId, reason, actorId = null, meta = {}) {
  clearSessionTimer(sessionId);

  const session = await prisma.orderSession.findUnique({
    where: { id: sessionId },
    include: sessionInclude(),
  });
  if (!session || session.status !== 'collecting') return null;

  const settings = await getSettings();
  const hasLines = session.lines.some((l) => l.qty > 0);

  if (!hasLines) {
    assertTransition('session', 'collecting', 'closed');
    const closed = await prisma.$transaction(async (tx) => {
      const updated = await claimCollectingSession(tx, sessionId, 'closed');
      if (!updated) return null;
      await tx.office.update({
        where: { id: session.officeId },
        data: { activeCollectingSessionId: null },
      });
      return updated;
    });
    if (!closed) return null;
    await writeEvent(sessionId, SessionEventType.CLOSED, actorId, { reason }, meta.requestId);
    await writeAudit(actorId, SessionEventType.CLOSED, { sessionId, reason }, meta);
    const payload = await serializeSession(closed);
    await notificationService.notify({
      rooms: [`office:${session.officeId}`],
      event: SocketEvents.SESSION_CLOSED,
      payload,
      requestId: meta.requestId,
    });
    await notificationService.notify({
      rooms: [`office:${session.officeId}`],
      event: SocketEvents.SESSION_UPDATED,
      payload: null,
      requestId: meta.requestId,
    });
    return payload;
  }

  // Süre doldu ve autoClose kapalıysa mutfağa gönderme; oturumu kapat
  if (reason === 'timeout' && !settings.autoClose) {
    assertTransition('session', 'collecting', 'closed');
    const closed = await prisma.$transaction(async (tx) => {
      const updated = await claimCollectingSession(tx, sessionId, 'closed');
      if (!updated) return null;
      await tx.office.update({
        where: { id: session.officeId },
        data: { activeCollectingSessionId: null },
      });
      return updated;
    });
    if (!closed) return null;
    await writeEvent(
      sessionId,
      SessionEventType.CLOSED,
      actorId,
      { reason, autoClose: false },
      meta.requestId
    );
    await writeAudit(actorId, SessionEventType.CLOSED, { sessionId, reason, autoClose: false }, meta);
    const payload = await serializeSession(closed);
    await notificationService.notify({
      rooms: [`office:${session.officeId}`],
      event: SocketEvents.SESSION_CLOSED,
      payload,
      requestId: meta.requestId,
    });
    await notificationService.notify({
      rooms: [`office:${session.officeId}`],
      event: SocketEvents.SESSION_UPDATED,
      payload: null,
      requestId: meta.requestId,
    });
    return payload;
  }

  assertTransition('session', 'collecting', 'sent');
  const { summary, details, specialRequests } = buildTicketPayload(session);

  const result = await prisma.$transaction(async (tx) => {
    const updated = await claimCollectingSession(tx, sessionId, 'sent');
    if (!updated) return null;
    const ticket = await tx.kitchenTicket.create({
      data: {
        sessionId,
        officeId: session.officeId,
        status: 'new',
        summaryJson: JSON.stringify({ items: summary, specialRequests }),
        detailsJson: JSON.stringify(details),
      },
      include: { office: true },
    });
    await tx.office.update({
      where: { id: session.officeId },
      data: { activeCollectingSessionId: null },
    });
    return { updated, ticket };
  });
  if (!result) return null;

  await writeEvent(sessionId, SessionEventType.SENT, actorId ?? session.openedById, { reason, summary }, meta.requestId);
  await writeAudit(actorId ?? session.openedById, SessionEventType.SENT, { sessionId, reason, summary }, meta);

  const sessionPayload = await serializeSession(result.updated);
  const ticketPayload = serializeTicket(result.ticket);

  await notificationService.notify({
    rooms: [`office:${session.officeId}`],
    event: SocketEvents.SESSION_SENT,
    payload: sessionPayload,
    requestId: meta.requestId,
  });
  await notificationService.notify({
    rooms: [`office:${session.officeId}`],
    event: SocketEvents.SESSION_UPDATED,
    payload: null,
    requestId: meta.requestId,
  });
  await notificationService.notify({
    rooms: ['kitchen', 'admins'],
    event: SocketEvents.KITCHEN_NEW,
    payload: ticketPayload,
    requestId: meta.requestId,
  });

  const kitchenPushBody = `${session.office.name}: ${summary.map((s) => `${s.qty}× ${s.name}`).join(', ')}`;
  const kitchenStaffIds = await activeUserIds({ role: 'kitchen' });
  await notifyUsers(kitchenStaffIds, {
    title: 'Yeni mutfak siparişi',
    body: kitchenPushBody,
    event: SocketEvents.KITCHEN_NEW,
    payload: {
      ticketId: result.ticket.id,
      sessionId,
      officeId: session.officeId,
      status: 'new',
    },
    url: '/kitchen',
    tag: `kitchen-${result.ticket.id}`,
    playSound: true,
  });

  const officeUserIds = await activeUserIds({
    officeId: session.officeId,
    role: 'office_user',
  });
  await notifyUsers(officeUserIds, {
    title: 'Sipariş mutfağa gitti',
    body: `${session.office.name}: ${summary.map((s) => `${s.qty}× ${s.name}`).join(', ')}`,
    event: SessionEventType.SENT,
    payload: { sessionId, ticketId: result.ticket.id },
    url: '/office',
  });

  return sessionPayload;
}

export async function updateTicketStatus(user, ticketId, status, meta = {}) {
  const ticket = await prisma.kitchenTicket.findUnique({
    where: { id: ticketId },
    include: { office: true, session: true },
  });
  if (!ticket) throw httpError(404, 'Sipariş bulunamadı');

  // Idempotent: same status → return current ticket, no event/socket spam
  if (ticket.status === status) {
    return serializeTicket(ticket);
  }

  // Legacy rows: treat ready as preparing for transition checks
  const fromStatus = ticket.status === 'ready' ? 'preparing' : ticket.status;
  assertTransition('ticket', fromStatus, status);

  const claimed = await prisma.kitchenTicket.updateMany({
    where: { id: ticketId, status: ticket.status },
    data: { status },
  });
  if (claimed.count === 0) {
    const latest = await prisma.kitchenTicket.findUnique({
      where: { id: ticketId },
      include: { office: true },
    });
    if (!latest) throw httpError(404, 'Sipariş bulunamadı');
    if (latest.status === status) return serializeTicket(latest);
    throw httpError(409, 'Sipariş durumu başka bir işlem tarafından değiştirildi');
  }

  const updated = await prisma.kitchenTicket.findUnique({
    where: { id: ticketId },
    include: { office: true },
  });

  const typeMap = {
    preparing: SessionEventType.PREPARING,
    delivered: SessionEventType.DELIVERED,
  };
  const eventType = typeMap[status];
  if (eventType) {
    await writeEvent(ticket.sessionId, eventType, user.id, { ticketId, status }, meta.requestId);
  }
  await writeAudit(user.id, `kitchen.${status}`, { ticketId }, meta);

  const payload = serializeTicket(updated);
  await notificationService.notify({
    rooms: ['kitchen', 'admins', `office:${ticket.officeId}`],
    event: SocketEvents.KITCHEN_UPDATED,
    payload,
    requestId: meta.requestId,
  });

  const titles = {
    preparing: ticket.status === 'delivered' ? 'Sipariş geri alındı' : 'Sipariş hazırlanıyor',
    delivered: 'Sipariş teslim edildi',
  };
  // Office-only status copy — kitchen/admin must not get "hazırlanıyor / teslim" inbox+push
  if (titles[status]) {
    const officeUserIds = await activeUserIds({
      officeId: ticket.officeId,
      role: 'office_user',
    });
    await notifyUsers(officeUserIds, {
      title: titles[status],
      body: ticket.office.name,
      event: eventType,
      payload: { ticketId, status, undo: ticket.status === 'delivered' && status === 'preparing' },
      url: '/office',
    });
  }

  return payload;
}

export async function reportTicketUnavailable(user, ticketId, { items, note } = {}, meta = {}) {
  const ticket = await prisma.kitchenTicket.findUnique({
    where: { id: ticketId },
    include: { office: true },
  });
  if (!ticket) throw httpError(404, 'Sipariş bulunamadı');
  if (!['new', 'preparing'].includes(ticket.status)) {
    throw httpError(400, 'Bu sipariş için eksik ürün bildirilemez');
  }

  const cleanItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      menuItemId: item?.menuItemId || item?.id || null,
      name: String(item?.name || '').trim().slice(0, 80),
    }))
    .filter((item) => item.name)
    .slice(0, 30);
  if (!cleanItems.length) throw httpError(400, 'En az bir ürün seçin');

  const trimmedNote =
    typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : null;

  const eventPayload = {
    ticketId: ticket.id,
    sessionId: ticket.sessionId,
    officeId: ticket.officeId,
    office: ticket.office,
    items: cleanItems,
    note: trimmedNote,
  };

  await writeEvent(
    ticket.sessionId,
    SessionEventType.UNAVAILABLE,
    user.id,
    eventPayload,
    meta.requestId
  );
  await writeAudit(user.id, 'kitchen.unavailable', eventPayload, meta);

  const names = cleanItems.map((i) => i.name).join(', ');
  const body = trimmedNote
    ? `${names} mevcut olmadığı için hazırlanamadı. ${trimmedNote}`
    : `${names} mevcut olmadığı için hazırlanamadı.`;

  const officeUserIds = await activeUserIds({
    officeId: ticket.officeId,
    role: 'office_user',
  });
  await notifyUsers(officeUserIds, {
    title: '⚠ Siparişinizde eksik ürün var',
    body,
    event: SessionEventType.UNAVAILABLE,
    payload: eventPayload,
    url: '/office',
  });

  // Other kitchen staff (not the reporter) — kitchen-oriented wording
  const kitchenStaffIds = await activeUserIds({
    role: 'kitchen',
    excludeIds: [user.id],
  });
  await notifyUsers(kitchenStaffIds, {
    title: 'Eksik ürün bildirildi',
    body: `${ticket.office.name}: ${names}${trimmedNote ? ` — ${trimmedNote}` : ''}`,
    event: SessionEventType.UNAVAILABLE,
    payload: eventPayload,
    url: '/kitchen',
    tag: `kitchen-unavail-${ticket.id}`,
  });

  await notificationService.notify({
    rooms: [`office:${ticket.officeId}`, 'kitchen', 'admins'],
    event: SocketEvents.KITCHEN_UNAVAILABLE,
    payload: eventPayload,
    requestId: meta.requestId,
  });

  logger.info('kitchen.unavailable', {
    ticketId,
    items: names,
    requestId: meta.requestId,
  });

  return eventPayload;
}

export async function setSpecialRequest(user, sessionId, note, meta = {}) {
  if (user.role !== 'office_user' || !user.officeId) {
    throw httpError(403, 'Sadece ofis kullanıcıları özel istek yazabilir');
  }

  const session = await prisma.orderSession.findUnique({ where: { id: sessionId } });
  if (!session || session.officeId !== user.officeId) {
    throw httpError(404, 'Sipariş oturumu bulunamadı');
  }
  if (session.status !== 'collecting') {
    throw httpError(400, 'Bu sipariş artık toplanmıyor');
  }
  if (new Date(session.endsAt).getTime() <= Date.now()) {
    await finalizeSession(sessionId, 'timeout', null, meta);
    throw httpError(400, 'Sipariş süresi doldu');
  }

  const trimmed =
    typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : '';

  await prisma.$transaction(async (tx) => {
    const live = await tx.orderSession.findFirst({
      where: { id: sessionId, status: 'collecting' },
    });
    if (!live) throw httpError(400, 'Bu sipariş artık toplanmıyor');

    if (!trimmed) {
      await tx.sessionSpecialRequest.deleteMany({ where: { sessionId, userId: user.id } });
      return;
    }

    await tx.sessionSpecialRequest.upsert({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      create: { sessionId, userId: user.id, note: trimmed },
      update: { note: trimmed },
    });
  });

  await writeEvent(
    sessionId,
    SessionEventType.SPECIAL_REQUEST,
    user.id,
    { note: trimmed || null },
    meta.requestId
  );
  await writeAudit(user.id, SessionEventType.SPECIAL_REQUEST, { sessionId, note: trimmed || null }, meta);

  const fresh = await ordersRepository.findSession(sessionId);
  if (!fresh || fresh.status !== 'collecting') {
    throw httpError(400, 'Bu sipariş artık toplanmıyor');
  }
  const payload = await serializeSession(fresh);
  await notificationService.notify({
    rooms: [`office:${user.officeId}`],
    event: SocketEvents.SESSION_UPDATED,
    payload,
    requestId: meta.requestId,
  });
  return payload;
}

const STAFF_CALL_COOLDOWN_MS = 30_000;
/** @type {Map<string, number>} */
const staffCallLastAt = new Map();

/**
 * Office → kitchen staff call (independent of order flow).
 * Rate-limited per office (30s). Uses existing notifyUsers (inbox + socket + push + playSound).
 */
export async function callKitchenStaff(user, meta = {}) {
  if (user.role !== 'office_user' || !user.officeId) {
    throw httpError(403, 'Sadece ofis kullanıcıları çağrı gönderebilir');
  }

  const office = await prisma.office.findUnique({ where: { id: user.officeId } });
  if (!office) throw httpError(404, 'Ofis bulunamadı');

  const now = Date.now();
  const prev = staffCallLastAt.get(user.officeId) || 0;
  if (now - prev < STAFF_CALL_COOLDOWN_MS) {
    throw httpError(429, 'Lütfen tekrar çağırmadan önce birkaç saniye bekleyin.');
  }
  staffCallLastAt.set(user.officeId, now);

  const officeName = office.name || 'Ofis';
  const title = 'Cemile Abla';
  const body = `${officeName} sizi bekliyor.`;

  const kitchenStaffIds = await activeUserIds({ role: 'kitchen' });
  await notifyUsers(kitchenStaffIds, {
    title,
    body,
    event: SessionEventType.STAFF_CALL,
    payload: {
      officeId: office.id,
      officeName,
      callerId: user.id,
      callerName: user.name,
    },
    url: '/kitchen',
    tag: `staff-call-${office.id}`,
    playSound: true,
  });

  await notificationService.notify({
    rooms: ['kitchen'],
    event: SocketEvents.KITCHEN_STAFF_CALL,
    payload: {
      officeId: office.id,
      officeName,
      callerId: user.id,
      callerName: user.name,
      title,
      body,
    },
    requestId: meta.requestId,
  });

  await writeAudit(
    user.id,
    SessionEventType.STAFF_CALL,
    { officeId: office.id, officeName },
    meta
  );

  logger.info('kitchen.staff_call', {
    officeId: office.id,
    callerId: user.id,
    requestId: meta.requestId,
  });

  return { ok: true, title, body };
}

export async function getPresenceForOffice(officeId) {
  const officeUsers = await prisma.user.findMany({
    where: { officeId, role: 'office_user', active: true },
    select: { id: true, name: true, username: true, avatarUrl: true },
    orderBy: { name: 'asc' },
  });
  const online = await presenceService.listOnline(officeId);
  const onlineIds = new Set(online.map((u) => u.id));
  return officeUsers.map((u) => ({ ...u, online: onlineIds.has(u.id) }));
}

export { writeAudit, writeEvent, notifyUsers };
