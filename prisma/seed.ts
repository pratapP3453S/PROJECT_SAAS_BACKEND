import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed...');

  // ─── Super Admin ──────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Admin@123', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@example.com' },
    update: {},
    create: {
      email: 'superadmin@example.com',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`✅ Super Admin created: ${superAdmin.email}`);

  // ─── Admin ────────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: await bcrypt.hash('Admin@123', 10),
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`✅ Admin created: ${admin.email}`);

  // ─── Regular User ─────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: await bcrypt.hash('User@123', 10),
      firstName: 'Regular',
      lastName: 'User',
      role: Role.USER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`✅ User created: ${user.email}`);

  console.log('✅ Database seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
