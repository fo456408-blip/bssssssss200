import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';
import { JwtUtils } from './jwt';

const PORT = 5015;
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
      console.log(`Admin Course-Teacher Assignment Flow Test Server started on port ${PORT}`);
      resolve();
    });
  });
}

async function runTests() {
  await setupServer();
  console.log('\n========================================');
  console.log('STARTING ADMIN COURSE-TEACHER ASSIGNMENT E2E FLOW AUDIT');
  console.log('========================================\n');

  try {
    // 1. Setup Admin Token & Discover 2 Teachers
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

    // Ensure we have at least 2 teachers for reassignment testing
    let teachers = await prisma.teacher.findMany({ include: { user: true } });
    if (teachers.length < 2) {
      const userA = await prisma.user.create({
        data: { username: `t_user_a_${Date.now()}`, passwordHash: 'dummy', fullName: 'المعلم أختبار (أ)', role: 'TEACHER' },
      });
      const teacherA = await prisma.teacher.create({ data: { userId: userA.id, specialization: 'برمجة' }, include: { user: true } });

      const userB = await prisma.user.create({
        data: { username: `t_user_b_${Date.now()}`, passwordHash: 'dummy', fullName: 'المعلم أختبار (ب)', role: 'TEACHER' },
      });
      const teacherB = await prisma.teacher.create({ data: { userId: userB.id, specialization: 'ذكاء اصطناعي' }, include: { user: true } });

      teachers = [teacherA, teacherB];
    }

    const teacherA = teachers[0];
    const teacherB = teachers[1];

    const teacherAToken = JwtUtils.signToken({
      userId: teacherA.userId.toString(),
      username: teacherA.user.username,
      role: 'TEACHER',
    });

    const teacherBToken = JwtUtils.signToken({
      userId: teacherB.userId.toString(),
      username: teacherB.user.username,
      role: 'TEACHER',
    });

    const academicYear = await prisma.academicYear.findFirst();

    // ----------------------------------------------------
    // TEST 1: Admin Creates Course with Teacher A Selected (201)
    // ----------------------------------------------------
    console.log('\n--- 1. Admin Creates Course with Teacher A Assigned ---');
    const courseCode = `TEST_CRS_${Math.floor(Math.random() * 90000 + 10000)}`;
    const courseName = `مادة البرمجة المتقدمة_${Math.floor(Math.random() * 9000 + 1000)}`;

    const createRes = await fetch(`${BASE_URL}/admin/courses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        academicYearId: academicYear!.id.toString(),
        code: courseCode,
        name: courseName,
        grade: 'FIRST_SECONDARY',
        teacherId: teacherA.id.toString(),
        defaultMonthlyFee: 400,
      }),
    });

    const createData = await createRes.json();
    const createdCourseId = createData.data?.id;
    recordTest(
      'Admin Create Course with Teacher Selection',
      createRes.status === 201 && Boolean(createdCourseId),
      `Status=${createRes.status}, Created Course ID=${createdCourseId || 'N/A'}`
    );

    // Verify TeacherCourse DB link
    const tcRecordA = await prisma.teacherCourse.findFirst({
      where: { courseId: BigInt(createdCourseId), teacherId: teacherA.id },
    });
    recordTest('TeacherCourse Relationship Created', Boolean(tcRecordA), `TeacherCourse ID=${tcRecordA?.id || 'N/A'}`);

    // ----------------------------------------------------
    // TEST 2: Teacher A Immediately Sees Assigned Course
    // ----------------------------------------------------
    console.log('\n--- 2. Teacher A Accessing Assigned Course ---');
    const teacherACoursesRes = await fetch(`${BASE_URL}/teacher/courses`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    const teacherACoursesData = await teacherACoursesRes.json();
    const teacherAHasCourse = Array.isArray(teacherACoursesData.data) && teacherACoursesData.data.some((c: any) => c.id.toString() === createdCourseId.toString());
    recordTest(
      'Teacher A Sees Assigned Course',
      teacherACoursesRes.status === 200 && teacherAHasCourse,
      `Status=${teacherACoursesRes.status}, Teacher A Sees Course=${teacherAHasCourse}`
    );

    // ----------------------------------------------------
    // TEST 3: Admin Reassigns Course to Teacher B (200)
    // ----------------------------------------------------
    console.log('\n--- 3. Admin Reassigns Course to Teacher B ---');
    const editRes = await fetch(`${BASE_URL}/admin/courses/${createdCourseId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        teacherId: teacherB.id.toString(),
      }),
    });

    recordTest('Admin Reassign Course', editRes.status === 200, `Status=${editRes.status}`);

    // Verify TeacherCourse links in DB
    const allTcRecords = await prisma.teacherCourse.findMany({
      where: { courseId: BigInt(createdCourseId) },
    });
    const belongsToBOnly = allTcRecords.length === 1 && allTcRecords[0].teacherId === teacherB.id;
    recordTest(
      'TeacherCourse Link Updated cleanly (No Duplicates)',
      belongsToBOnly,
      `Total TeacherCourse Links=${allTcRecords.length}, Assigned TeacherId=${allTcRecords[0]?.teacherId}`
    );

    // ----------------------------------------------------
    // TEST 4: Security Verification (Teacher A Loses Access, Teacher B Gains Access)
    // ----------------------------------------------------
    console.log('\n--- 4. Scope Security Verification after Reassignment ---');
    const teacherBCheck = await fetch(`${BASE_URL}/teacher/courses`, {
      headers: { Authorization: `Bearer ${teacherBToken}` },
    });
    const teacherBData = await teacherBCheck.json();
    const teacherBHasCourse = Array.isArray(teacherBData.data) && teacherBData.data.some((c: any) => c.id.toString() === createdCourseId.toString());
    recordTest('Teacher B Gains Access', teacherBHasCourse, `Teacher B Sees Course=${teacherBHasCourse}`);

    const teacherACheck = await fetch(`${BASE_URL}/teacher/courses`, {
      headers: { Authorization: `Bearer ${teacherAToken}` },
    });
    const teacherAData = await teacherACheck.json();
    const teacherAStillHasCourse = Array.isArray(teacherAData.data) && teacherAData.data.some((c: any) => c.id.toString() === createdCourseId.toString());
    recordTest('Teacher A Loses Access', !teacherAStillHasCourse, `Teacher A Sees Course=${teacherAStillHasCourse}`);

    // Direct API access check for Teacher A (Must return 403)
    const groupRes = await fetch(`${BASE_URL}/teacher/groups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: createdCourseId.toString(), name: 'محاولة إنشاء مجموعة كورس غريب' }),
    });
    recordTest('Teacher A Direct API Access Blocked (403)', groupRes.status === 403, `Status=${groupRes.status}`);

    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    await prisma.teacherCourse.deleteMany({ where: { courseId: BigInt(createdCourseId) } });
    await prisma.course.delete({ where: { id: BigInt(createdCourseId) } });
    recordTest('Cleanup', true, 'Test course and links cleaned up successfully');
  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
    await prisma.$disconnect();

    console.log('\n========================================');
    console.log(`ADMIN COURSE-TEACHER ASSIGNMENT AUDIT COMPLETED: PASS = ${passCount}, FAIL = ${failCount}`);
    console.log('========================================\n');
  }
}

runTests();
