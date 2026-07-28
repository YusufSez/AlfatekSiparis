/**
 * Development DB cleanup — safe to re-run.
 *
 * Keeps (never deletes):
 *   admin  (admin)
 *   yusuf  (office_user + office)
 *   mutfak (kitchen)
 *   AppSetting
 *
 * Wipes: orders, tickets, events, skips, lines, notifications, push,
 * announcements, audit logs, other users, extra offices.
 * Reseeds starter menu: Çay, Kahve, Soda, Su.
 *
 * Usage: npm run db:clean:dev -w apps/api
 * Refuses to run when NODE_ENV=production.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KEEP_USERNAMES = Object.freeze(['admin', 'yusuf', 'mutfak']);

const STARTER_MENU = Object.freeze([
  { name: 'Çay', icon: 'tea', sortOrder: 1 },
  { name: 'Kahve', icon: 'coffee', sortOrder: 2 },
  { name: 'Soda', icon: 'soda', sortOrder: 3 },
  { name: 'Su', icon: 'water', sortOrder: 4 },
]);

async function countAll(model) {
  return prisma[model].count();
}

async function deleteManyCounted(label, model, where = undefined) {
  const before = await countAll(model);
  const result = where
    ? await prisma[model].deleteMany({ where })
    : await prisma[model].deleteMany();
  console.log(`  ${label}: ${result.count} silindi (önce ${before})`);
  return result.count;
}

async function ensureKeepUsers(passwordHash) {
  let admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: 'Admin',
        username: 'admin',
        passwordHash,
        role: 'admin',
        active: true,
      },
    });
    console.log('  + admin oluşturuldu');
  }

  let office =
    (await prisma.office.findFirst({ where: { name: 'Teknik Ofis' } })) ||
    (await prisma.office.findFirst());
  if (!office) {
    office = await prisma.office.create({
      data: { name: 'Teknik Ofis', color: '#1B6B4A' },
    });
    console.log('  + Teknik Ofis oluşturuldu');
  }

  let yusuf = await prisma.user.findUnique({ where: { username: 'yusuf' } });
  if (!yusuf) {
    yusuf = await prisma.user.create({
      data: {
        name: 'Yusuf',
        username: 'yusuf',
        passwordHash,
        role: 'office_user',
        officeId: office.id,
        active: true,
      },
    });
    console.log('  + yusuf oluşturuldu');
  }

  let mutfak = await prisma.user.findUnique({ where: { username: 'mutfak' } });
  if (!mutfak) {
    mutfak = await prisma.user.create({
      data: {
        name: 'Cemile Abla',
        username: 'mutfak',
        passwordHash,
        role: 'kitchen',
        active: true,
      },
    });
    console.log('  + mutfak oluşturuldu');
  }

  return { admin, yusuf, mutfak, office };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run: NODE_ENV=production');
    process.exit(1);
  }

  console.log('=== Dev DB clean başlıyor ===');
  console.log(`Korumalı kullanıcılar: ${KEEP_USERNAMES.join(', ')}`);

  const passwordHash = await bcrypt.hash('123456', 10);
  const { admin, yusuf, mutfak, office } = await ensureKeepUsers(passwordHash);
  const keepIds = [admin.id, yusuf.id, mutfak.id];

  // Clear office active session pointer before wiping sessions
  await prisma.office.updateMany({ data: { activeCollectingSessionId: null } });

  console.log('Tablolar temizleniyor…');
  let totalDeleted = 0;
  totalDeleted += await deleteManyCounted('PushSubscription', 'pushSubscription');
  totalDeleted += await deleteManyCounted('UserNotification', 'userNotification');
  totalDeleted += await deleteManyCounted('SessionEvent', 'sessionEvent');
  totalDeleted += await deleteManyCounted('SessionSkip', 'sessionSkip');
  totalDeleted += await deleteManyCounted('OrderLine', 'orderLine');
  totalDeleted += await deleteManyCounted('KitchenTicket', 'kitchenTicket');
  totalDeleted += await deleteManyCounted('OrderSession', 'orderSession');
  totalDeleted += await deleteManyCounted('AuditLog', 'auditLog');
  totalDeleted += await deleteManyCounted('Announcement', 'announcement');

  // Delete other users (never the keep set)
  totalDeleted += await deleteManyCounted('User (test)', 'user', {
    id: { notIn: keepIds },
    username: { notIn: [...KEEP_USERNAMES] },
  });

  // Ensure roles / office links for keep users (do not wipe passwords)
  await prisma.user.update({
    where: { id: admin.id },
    data: { role: 'admin', officeId: null, active: true, name: admin.name || 'Admin' },
  });

  const officeId = yusuf.officeId || office.id;
  await prisma.user.update({
    where: { id: yusuf.id },
    data: {
      role: 'office_user',
      officeId,
      active: true,
      name: yusuf.name || 'Yusuf',
    },
  });

  await prisma.user.update({
    where: { id: mutfak.id },
    data: { role: 'kitchen', officeId: null, active: true, name: mutfak.name || 'Cemile Abla' },
  });

  // Offices: keep only yusuf's office
  const keptOfficeId = (await prisma.user.findUnique({ where: { id: yusuf.id } })).officeId;
  if (keptOfficeId) {
    totalDeleted += await deleteManyCounted('Office (extra)', 'office', {
      id: { notIn: [keptOfficeId] },
    });
  }

  // Menu reset
  totalDeleted += await deleteManyCounted('MenuItem', 'menuItem');
  for (const item of STARTER_MENU) {
    await prisma.menuItem.create({ data: { ...item, active: true } });
  }

  // Ensure AppSetting exists (never wipe existing values if present)
  const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
  if (!settings) {
    await prisma.appSetting.create({
      data: {
        id: 1,
        sessionDurationSec: 120,
        companyName: 'Alfatek Ofis Sipariş',
        notificationSound: true,
        autoClose: true,
        workingHoursStart: '08:00',
        workingHoursEnd: '19:00',
        config: JSON.stringify({ kitchenSoundVolume: 0.6, presenceTimeout: 60 }),
      },
    });
    console.log('  + AppSetting oluşturuldu');
  }

  const finalUsers = await prisma.user.findMany({
    select: { username: true, role: true, officeId: true, active: true },
    orderBy: { username: 'asc' },
  });
  const finalMenu = await prisma.menuItem.findMany({
    select: { name: true, icon: true, sortOrder: true, active: true },
    orderBy: { sortOrder: 'asc' },
  });
  const finalOffices = await prisma.office.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  // Safety assert
  const names = new Set(finalUsers.map((u) => u.username));
  for (const u of KEEP_USERNAMES) {
    if (!names.has(u)) {
      throw new Error(`Güvenlik kontrolü başarısız: ${u} kayboldu`);
    }
  }

  console.log('=== Sonuç ===');
  console.log(`Toplam silinen kayıt (yaklaşık): ${totalDeleted}`);
  console.log('Kalan kullanıcılar:', finalUsers);
  console.log('Kalan ofisler:', finalOffices);
  console.log('Kalan menü:', finalMenu);
  console.log('Dev clean OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
