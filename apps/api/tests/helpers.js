import bcrypt from 'bcryptjs';
import { prisma } from '../src/common/db.js';
import { createApp } from '../src/app.js';
import { presenceService, MemoryPresenceProvider } from '../src/modules/presence/presence.service.js';

export { prisma };

export function getApp() {
  return createApp(process.env.CORS_ORIGIN || 'http://localhost:5173');
}

export async function resetDb() {
  await prisma.pushSubscription.deleteMany().catch(() => {});
  await prisma.userNotification.deleteMany();
  await prisma.sessionEvent.deleteMany();
  await prisma.sessionSkip.deleteMany().catch(() => {});
  await prisma.orderLine.deleteMany();
  await prisma.kitchenTicket.deleteMany();
  await prisma.orderSession.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.user.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.office.deleteMany();
  await prisma.appSetting.deleteMany();

  await prisma.appSetting.create({
    data: {
      id: 1,
      sessionDurationSec: 120,
      companyName: 'Test',
      notificationSound: true,
      autoClose: true,
      workingHoursStart: '08:00',
      workingHoursEnd: '19:00',
      config: '{}',
    },
  });

  const teknik = await prisma.office.create({
    data: { name: 'Teknik Ofis', color: '#1B6B4A' },
  });
  const operasyon = await prisma.office.create({
    data: { name: 'Operasyon Ofisi', color: '#C45C26' },
  });

  const tea = await prisma.menuItem.create({
    data: { name: 'Çay', icon: 'tea', sortOrder: 1 },
  });
  const soda = await prisma.menuItem.create({
    data: { name: 'Soda', icon: 'soda', sortOrder: 2 },
  });

  const passwordHash = await bcrypt.hash('123456', 10);
  const admin = await prisma.user.create({
    data: { name: 'Admin', username: 'admin', passwordHash, role: 'admin' },
  });
  const kitchen = await prisma.user.create({
    data: { name: 'Mutfak', username: 'mutfak', passwordHash, role: 'kitchen' },
  });
  const yusuf = await prisma.user.create({
    data: {
      name: 'Yusuf',
      username: 'yusuf',
      passwordHash,
      role: 'office_user',
      officeId: teknik.id,
    },
  });
  const ahmet = await prisma.user.create({
    data: {
      name: 'Ahmet',
      username: 'ahmet',
      passwordHash,
      role: 'office_user',
      officeId: teknik.id,
    },
  });
  const murat = await prisma.user.create({
    data: {
      name: 'Murat',
      username: 'murat',
      passwordHash,
      role: 'office_user',
      officeId: operasyon.id,
    },
  });

  // Reset presence singleton provider state between tests
  presenceService.provider = new MemoryPresenceProvider();

  return { teknik, operasyon, tea, soda, admin, kitchen, yusuf, ahmet, murat };
}

export async function loginAs(request, username, password = '123456', remember) {
  const body = { username, password };
  if (remember !== undefined) body.remember = remember;
  const res = await request.post('/auth/login').send(body);
  return res;
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
