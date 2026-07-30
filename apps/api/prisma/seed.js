import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

/**
 * DESTRUCTIVE: deleteMany on all domain tables, then inserts demo data.
 * Never run against production. Prefer ADMIN_* bootstrap for the first admin.
 * Override only for intentional wipe: FORCE_SEED=1
 */
if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== '1') {
  console.error(
    'Seed reddedildi: NODE_ENV=production. Production’da db:seed / db:setup çalıştırmayın. ' +
      'İlk admin için ADMIN_* bootstrap kullanın (docs/RENDER_ENV.md). ' +
      'Bilinçli wipe için FORCE_SEED=1 gerekir.'
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  await prisma.userNotification.deleteMany();
  await prisma.sessionEvent.deleteMany();
  await prisma.sessionSkip.deleteMany();
  await prisma.orderLine.deleteMany();
  await prisma.kitchenTicket.deleteMany();
  await prisma.orderSession.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.office.deleteMany();
  await prisma.appSetting.deleteMany();

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

  const teknik = await prisma.office.create({
    data: { name: 'Teknik Ofis', color: '#1B6B4A' },
  });
  const operasyon = await prisma.office.create({
    data: { name: 'Operasyon Ofisi', color: '#C45C26' },
  });

  const menu = [
    { name: 'Çay', icon: 'tea', sortOrder: 1 },
    { name: 'Soda', icon: 'soda', sortOrder: 2 },
    { name: 'Türk Kahvesi', icon: 'turkish_coffee', sortOrder: 5 },
    { name: 'Diğer', icon: 'other', sortOrder: 99 },
  ];
  for (const item of menu) {
    await prisma.menuItem.create({ data: item });
  }

  const passwordHash = await bcrypt.hash('Alfatek2026.', 10);

  await prisma.user.create({
    data: { name: 'Admin', username: 'admin', passwordHash, role: 'admin' },
  });
  await prisma.user.create({
    data: { name: 'Cemile Abla', username: 'mutfak', passwordHash, role: 'kitchen' },
  });
  await prisma.user.createMany({
    data: [
      { name: 'Yusufcan', username: 'yusufcan', passwordHash, role: 'office_user', officeId: teknik.id },
      { name: 'Emirhan', username: 'emirhan', passwordHash, role: 'office_user', officeId: teknik.id },
      { name: 'Onur', username: 'onur', passwordHash, role: 'office_user', officeId: teknik.id },
    ],
  });

  console.log('Seed OK — şifre: Alfatek2026.');
  console.log('admin / mutfak / yusufcan / emirhan / onur');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
