import { prisma } from '../src/config/database';
import { PasswordUtils } from '../src/utils/password';

async function main() {
  const username = 'admin';
  const password = 'DevPassword123!';

  const passwordHash = await PasswordUtils.hashPassword(password);

  const admin = await prisma.user.upsert({
    where: {
      username,
    },
    update: {
      passwordHash,
      fullName: 'System Administrator',
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      username,
      passwordHash,
      fullName: 'System Administrator',
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('========================================');
  console.log('Admin account created successfully');
  console.log('========================================');
  console.log(`ID:       ${admin.id}`);
  console.log(`Username: ${username}`);
  console.log(`Password: ${password}`);
  console.log(`Role:     ${admin.role}`);
  console.log(`Active:   ${admin.isActive}`);
  console.log('========================================');
}

main()
  .catch((error) => {
    console.error('Failed to create admin:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });