import { prisma } from '../config/database';
import bcrypt from 'bcryptjs';

async function main() {
  const teacherUser = await prisma.user.findFirst({
    where: { role: 'TEACHER' },
    include: {
      teacher: {
        include: {
          teacherCourses: {
            include: { course: true },
          },
        },
      },
    },
  });

  if (!teacherUser) {
    console.log('NO_TEACHER_FOUND');
    return;
  }

  // Ensure known test password for browser UI login
  const testPassword = 'TeacherPassword123!';
  const passwordHash = await bcrypt.hash(testPassword, 10);

  await prisma.user.update({
    where: { id: teacherUser.id },
    data: { passwordHash, isActive: true },
  });

  console.log('TEACHER_LOGIN_INFO:', JSON.stringify({
    username: teacherUser.username,
    password: testPassword,
    fullName: teacherUser.fullName,
    courses: teacherUser.teacher?.teacherCourses.map((tc) => tc.course.name),
  }));
}

main().finally(() => prisma.$disconnect());
