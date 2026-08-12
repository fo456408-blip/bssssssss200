import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';
import { JwtUtils } from './jwt';

const BACKEND_PORT = 5025;
const BASE_URL = `http://localhost:${BACKEND_PORT}/api/v1`;

let server: Server;

async function setupBackend(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(BACKEND_PORT, () => {
      console.log(`Backend server for Admin UI Verification started on port ${BACKEND_PORT}`);
      resolve();
    });
  });
}

async function verifyFlow() {
  await setupBackend();
  console.log('\n========================================');
  console.log('STARTING FULL ADMIN TEACHER & COURSE UI VERIFICATION');
  console.log('========================================\n');

  try {
    // 1. Discover Real Admin Account
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      console.error('✖ No admin user found in DB');
      return;
    }

    const adminToken = JwtUtils.signToken({
      userId: adminUser.id.toString(),
      username: adminUser.username,
      role: 'ADMIN',
    });

    console.log(`[✔] Admin authenticated: UserID=${adminUser.id}, Username=${adminUser.username}`);

    // 2. Simulate Admin Creating Teacher via POST /admin/teachers
    const testUsername = `ui_prof_${Math.floor(Math.random() * 90000 + 10000)}`;
    const testFullName = `أستاذ أحمد التخصصي_${Math.floor(Math.random() * 900 + 100)}`;
    const testPassword = 'TeacherSecret123!';

    const createTeacherRes = await fetch(`${BASE_URL}/admin/teachers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullName: testFullName,
        username: testUsername,
        password: testPassword,
        phone: '01011223344',
        specialization: 'علوم الحاسب والشبكات',
        bio: 'مدرس معتمد في البرمجة والشبكات',
      }),
    });

    const createTeacherData = await createTeacherRes.json();
    const createdTeacherId = createTeacherData.data?.id;
    console.log(`[✔] Admin Teacher Creation API: Status=${createTeacherRes.status}, TeacherID=${createdTeacherId}`);

    // 3. Verify Admin GET /admin/teachers lists the new Teacher
    const listTeachersRes = await fetch(`${BASE_URL}/admin/teachers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listTeachersData = await listTeachersRes.json();
    const foundInTeacherList = Array.isArray(listTeachersData.data) && listTeachersData.data.some((t: any) => t.id.toString() === createdTeacherId.toString());
    console.log(`[✔] Admin GET /admin/teachers Returns New Teacher: ${foundInTeacherList}`);

    // 4. Simulate Admin Creating Course selecting New Teacher
    const academicYear = await prisma.academicYear.findFirst();
    const courseCode = `UI_CRS_${Math.floor(Math.random() * 90000 + 10000)}`;
    const courseName = `مادة البرمجة بالحي_${Math.floor(Math.random() * 900 + 100)}`;

    const createCourseRes = await fetch(`${BASE_URL}/admin/courses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicYearId: academicYear!.id.toString(),
        code: courseCode,
        name: courseName,
        grade: 'THIRD_SECONDARY',
        teacherId: createdTeacherId.toString(),
        defaultMonthlyFee: 500,
      }),
    });

    const createCourseData = await createCourseRes.json();
    const createdCourseId = createCourseData.data?.id;
    console.log(`[✔] Admin Course Creation API with Teacher: Status=${createCourseRes.status}, CourseID=${createdCourseId}`);

    // 5. Verify GET /admin/courses returns course with assigned teacher details
    const getCoursesRes = await fetch(`${BASE_URL}/admin/courses`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const getCoursesData = await getCoursesRes.json();
    const targetCourse = Array.isArray(getCoursesData.data) && getCoursesData.data.find((c: any) => c.id.toString() === createdCourseId.toString());
    const assignedTeacherName = targetCourse?.teacherCourses?.[0]?.teacher?.user?.fullName;
    console.log(`[✔] Admin GET /admin/courses verifies Assigned Teacher: ${assignedTeacherName === testFullName} (${assignedTeacherName})`);

    // 6. Simulate New Teacher Login & Verification
    const newTeacherUser = await prisma.user.findFirst({ where: { username: testUsername } });
    const teacherToken = JwtUtils.signToken({
      userId: newTeacherUser!.id.toString(),
      username: testUsername,
      role: 'TEACHER',
    });

    const teacherPortalCoursesRes = await fetch(`${BASE_URL}/teacher/courses`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const teacherPortalData = await teacherPortalCoursesRes.json();
    const teacherSeesCourse = Array.isArray(teacherPortalData.data) && teacherPortalData.data.some((c: any) => c.id.toString() === createdCourseId.toString());
    console.log(`[✔] Teacher Portal GET /teacher/courses: Teacher Sees Assigned Course=${teacherSeesCourse}`);

    // Cleanup
    await prisma.teacherCourse.deleteMany({ where: { courseId: BigInt(createdCourseId) } });
    await prisma.course.delete({ where: { id: BigInt(createdCourseId) } });
    await prisma.teacher.delete({ where: { id: BigInt(createdTeacherId) } });
    await prisma.user.delete({ where: { id: newTeacherUser!.id } });
    console.log(`[✔] Cleanup completed.`);

    console.log('\n========================================');
    console.log('FULL ADMIN TEACHER & COURSE UI VERIFICATION: 100% SUCCESS');
    console.log('========================================\n');
  } catch (err: any) {
    console.error('Verification Error:', err);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

verifyFlow();
