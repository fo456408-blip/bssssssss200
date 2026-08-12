import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';
import { JwtUtils } from './jwt';

const PORT = 5020;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;
let passCount = 0;
let failCount = 0;

function recordTest(title: string, success: boolean, detail: string) {
  if (success) {
    passCount++;
    console.log(`[✔ PASS] ${title}: ${detail}`);
  } else {
    failCount++;
    console.error(`[✖ FAIL] ${title}: ${detail}`);
  }
}

async function setupServer(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Admin Teacher Creation & Course Assignment Test Server started on port ${PORT}`);
      resolve();
    });
  });
}

async function runTests() {
  await setupServer();
  console.log('\n========================================');
  console.log('STARTING ADMIN DEDICATED TEACHER CREATION & COURSE ASSIGNMENT FLOW AUDIT');
  console.log('========================================\n');

  try {
    // 1. Discover Admin User & Token
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      recordTest('Admin Discovery', false, 'No admin user found in DB');
      return;
    }

    const adminToken = JwtUtils.signToken({
      userId: adminUser.id.toString(),
      username: adminUser.username,
      role: 'ADMIN',
    });

    // ----------------------------------------------------
    // STEP 1: Admin Creates New Teacher via POST /admin/teachers
    // ----------------------------------------------------
    console.log('\n--- Step 1: Admin Creates New Teacher ---');
    const teacherUsername = `prof_teacher_${Math.floor(Math.random() * 90000 + 10000)}`;
    const teacherFullName = `د. محمود عبدالفتاح_${Math.floor(Math.random() * 900 + 100)}`;
    const teacherPassword = 'DevPassword123!';

    const createTeacherRes = await fetch(`${BASE_URL}/admin/teachers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullName: teacherFullName,
        username: teacherUsername,
        password: teacherPassword,
        phone: `010203${Math.floor(Math.random() * 90000 + 10000)}`,
        specialization: 'برمجة وتطوير ويب',
        bio: 'استشاري البرمجيات والذكاء الاصطناعي',
      }),
    });

    const createTeacherData = await createTeacherRes.json();
    const createdTeacherId = createTeacherData.data?.id;
    recordTest(
      'Admin Create Teacher via POST /admin/teachers',
      createTeacherRes.status === 201 && Boolean(createdTeacherId),
      `Status=${createTeacherRes.status}, Created Teacher ID=${createdTeacherId || 'N/A'}`
    );

    // Verify DB Persistence (User + Teacher)
    const dbTeacher = await prisma.teacher.findUnique({
      where: { id: BigInt(createdTeacherId) },
      include: { user: true },
    });
    recordTest(
      'Teacher Persistence in DB',
      Boolean(dbTeacher && dbTeacher.user.role === 'TEACHER' && dbTeacher.user.isActive),
      `Role=${dbTeacher?.user.role}, IsActive=${dbTeacher?.user.isActive}`
    );

    // ----------------------------------------------------
    // STEP 2: Teacher List Query Returns New Teacher
    // ----------------------------------------------------
    console.log('\n--- Step 2: Verifying Teacher in Admin List ---');
    const listTeachersRes = await fetch(`${BASE_URL}/admin/teachers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listTeachersData = await listTeachersRes.json();
    const foundInList = Array.isArray(listTeachersData.data) && listTeachersData.data.some((t: any) => t.id.toString() === createdTeacherId.toString());
    recordTest(
      'Newly Created Teacher Appears in Admin Teacher List',
      listTeachersRes.status === 200 && foundInList,
      `Found Teacher in List=${foundInList}`
    );

    // ----------------------------------------------------
    // STEP 3: Admin Creates Course with Newly Created Teacher
    // ----------------------------------------------------
    console.log('\n--- Step 3: Admin Creates Course & Assigns New Teacher ---');
    const academicYear = await prisma.academicYear.findFirst();
    const courseCode = `IND_CRS_${Math.floor(Math.random() * 90000 + 10000)}`;
    const courseName = `مادة هياكل البيانات والمعادلات_${Math.floor(Math.random() * 900 + 100)}`;

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
        grade: 'SECOND_SECONDARY',
        teacherId: createdTeacherId.toString(),
        defaultMonthlyFee: 450,
      }),
    });

    const createCourseData = await createCourseRes.json();
    const createdCourseId = createCourseData.data?.id;
    recordTest(
      'Admin Create Course with Teacher Selection',
      createCourseRes.status === 201 && Boolean(createdCourseId),
      `Status=${createCourseRes.status}, Created Course ID=${createdCourseId || 'N/A'}`
    );

    // Verify TeacherCourse DB link
    const tcRecord = await prisma.teacherCourse.findFirst({
      where: { courseId: BigInt(createdCourseId), teacherId: BigInt(createdTeacherId) },
    });
    recordTest('TeacherCourse Relationship Created', Boolean(tcRecord), `TeacherCourse ID=${tcRecord?.id || 'N/A'}`);

    // ----------------------------------------------------
    // STEP 4: Newly Created Teacher Logs in & Sees Assigned Course
    // ----------------------------------------------------
    console.log('\n--- Step 4: Teacher Login & Access Verification ---');
    const newTeacherToken = JwtUtils.signToken({
      userId: dbTeacher!.userId.toString(),
      username: teacherUsername,
      role: 'TEACHER',
    });

    const teacherCoursesRes = await fetch(`${BASE_URL}/teacher/courses`, {
      headers: { Authorization: `Bearer ${newTeacherToken}` },
    });
    const teacherCoursesData = await teacherCoursesRes.json();
    const teacherHasCourse = Array.isArray(teacherCoursesData.data) && teacherCoursesData.data.some((c: any) => c.id.toString() === createdCourseId.toString());
    recordTest(
      'New Teacher Sees Assigned Course Immediately',
      teacherCoursesRes.status === 200 && teacherHasCourse,
      `Status=${teacherCoursesRes.status}, Teacher Sees Course=${teacherHasCourse}`
    );

    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    await prisma.teacherCourse.deleteMany({ where: { courseId: BigInt(createdCourseId) } });
    await prisma.course.delete({ where: { id: BigInt(createdCourseId) } });
    await prisma.teacher.delete({ where: { id: BigInt(createdTeacherId) } });
    await prisma.user.delete({ where: { id: dbTeacher!.userId } });
    recordTest('Cleanup', true, 'Test records cleaned up successfully');
  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
    await prisma.$disconnect();

    console.log('\n========================================');
    console.log(`ADMIN TEACHER CREATION & ASSIGNMENT AUDIT COMPLETED: PASS = ${passCount}, FAIL = ${failCount}`);
    console.log('========================================\n');
  }
}

runTests();
