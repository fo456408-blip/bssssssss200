import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING PRISMA DIAGNOSTIC VERIFICATION ---');

  // 1. Verify prisma.user.findFirst()
  const user = await prisma.user.findFirst();
  console.log('✔ prisma.user.findFirst() SUCCESS: Found user:', user ? `${user.username} (${user.role})` : 'None');

  // 2. Verify prisma.subject.findMany()
  const subjects = await prisma.subject.findMany();
  console.log('✔ prisma.subject.findMany() SUCCESS: Count =', subjects.length);
  subjects.forEach(s => console.log(`  - [${s.code}] ${s.name}`));

  // 3. Verify counts across key tables
  const studentsCount = await prisma.student.count();
  const teachersCount = await prisma.teacher.count();
  const parentsCount = await prisma.parent.count();
  const coursesCount = await prisma.course.count();

  console.log(`✔ Data Verification: Students=${studentsCount}, Teachers=${teachersCount}, Parents=${parentsCount}, Courses=${coursesCount}`);
  console.log('--- PRISMA DIAGNOSTIC VERIFICATION COMPLETED SUCCESSFULLY ---');
}

main()
  .catch((e) => {
    console.error('❌ Diagnostic Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
