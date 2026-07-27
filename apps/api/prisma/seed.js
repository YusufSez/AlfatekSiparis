import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.userNotification.deleteMany();
  await prisma.sessionEvent.deleteMany();
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
    { name: 'Kahve', icon: 'coffee', sortOrder: 3 },
    { name: 'Su', icon: 'water', sortOrder: 4 },
  ];
  for (const item of menu) {
    await prisma.menuItem.create({ data: item });
  }

  const passwordHash = await bcrypt.hash('123456', 10);

  await prisma.user.create({
    data: { name: 'Admin', username: 'admin', passwordHash, role: 'admin' },
  });
  await prisma.user.create({
    data: { name: 'Cemile Abla', username: 'mutfak', passwordHash, role: 'kitchen' },
  });
  await prisma.user.createMany({
    data: [
      { name: 'Yusuf', username: 'yusuf', passwordHash, role: 'office_user', officeId: teknik.id },
      { name: 'Ahmet', username: 'ahmet', passwordHash, role: 'office_user', officeId: teknik.id },
      { name: 'Mehmet', username: 'mehmet', passwordHash, role: 'office_user', officeId: teknik.id },
      { name: 'Murat', username: 'murat', passwordHash, role: 'office_user', officeId: operasyon.id },
      { name: 'Veli', username: 'veli', passwordHash, role: 'office_user', officeId: operasyon.id },
    ],
  });

  console.log('Seed OK — şifre: 123456');
  console.log('admin / mutfak / yusuf / ahmet / mehmet / murat / veli');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
