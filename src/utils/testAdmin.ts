import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';

const PORT = 5002;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Admin Test server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Admin Test server stopped');
      resolve();
    });
  });
}

interface TestResult {
  scenario: string;
  passed: boolean;
  message?: string;
}

const results: TestResult[] = [];

function assertEqual(scenario: string, actual: any, expected: any, details?: string) {
  const passed = actual === expected;
  results.push({
    scenario,
    passed,
    message: passed ? 'PASS' : `FAIL: Expected ${expected}, got ${actual}. ${details || ''}`,
  });
  console.log(`[${passed ? '✔ PASS' : '❌ FAIL'}] ${scenario}`);
}

async function runAdminTests() {
  await setup();

  try {
    // 1. Obtain Admin Token
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'DevPassword123!' }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.data.token;

    // 2. Obtain Student Token for Role Guard Rejection checks
    const studentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
    });
    const studentLoginData = await studentLoginRes.json();
    const studentToken = studentLoginData.data.token;

    // --- TEST 1: Role Authorization Protection ---
    const forbiddenRes = await fetch(`${BASE_URL}/admin/students`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    assertEqual('1. Student accessing /admin/students rejected with 403', forbiddenRes.status, 403);

    const unauthRes = await fetch(`${BASE_URL}/admin/students`, { method: 'GET' });
    assertEqual('2. Unauthenticated user accessing /admin/students rejected with 401', unauthRes.status, 401);

    // --- TEST 2: Students Domain CRUD & Pagination ---
    const getStudentsRes = await fetch(`${BASE_URL}/admin/students?page=1&limit=10`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const studentsData = await getStudentsRes.json();
    assertEqual('3. Admin list students (Status 200)', getStudentsRes.status, 200);
    assertEqual('4. Admin list students (Pagination Meta)', typeof studentsData.meta.total, 'number');

    // Create New Student
    const newStudentUsername = `new_student_${Date.now()}`;
    const createStudentRes = await fetch(`${BASE_URL}/admin/students`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: newStudentUsername,
        password: 'Password123!',
        fullName: 'تست طالب جديد',
        grade: 'FIRST_SECONDARY',
        schoolName: 'مدرسة تجريبية',
      }),
    });
    const createdStudentData = await createStudentRes.json();
    assertEqual('5. Admin create student (Status 201)', createStudentRes.status, 201);
    assertEqual('6. Admin create student (Role STUDENT)', createdStudentData.data.user.role, 'STUDENT');

    const newStudentId = createdStudentData.data.id;

    // Update Student
    const updateStudentRes = await fetch(`${BASE_URL}/admin/students/${newStudentId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fullName: 'تست طالب معدل' }),
    });
    assertEqual('7. Admin update student (Status 200)', updateStudentRes.status, 200);

    // Toggle Student Status
    const toggleStudentRes = await fetch(`${BASE_URL}/admin/students/${newStudentId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive: false }),
    });
    assertEqual('8. Admin toggle student status (Status 200)', toggleStudentRes.status, 200);

    // --- TEST 3: Subjects Domain ---
    const subjectCode = `SUB_${Date.now()}`;
    const createSubjectRes = await fetch(`${BASE_URL}/admin/subjects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: subjectCode,
        name: 'مادة الفيزياء التجريبية',
        description: 'اختبار إنتاج مادة جديدة',
      }),
    });
    const createdSubjectData = await createSubjectRes.json();
    assertEqual('9. Admin create subject (Status 201)', createSubjectRes.status, 201);

    const subjectId = createdSubjectData.data.id;

    // --- TEST 4: Academic Years Domain & Single Current Year Transaction ---
    const academicYearName = `2027/2028_${Date.now()}`;
    const createYearRes = await fetch(`${BASE_URL}/admin/academic-years`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: academicYearName,
        startDate: '2027-09-01',
        endDate: '2028-06-30',
        isCurrent: true, // Should set this as current and unset others via transaction
      }),
    });
    const createdYearData = await createYearRes.json();
    assertEqual('10. Admin create academic year (Status 201)', createYearRes.status, 201);
    assertEqual('11. Academic year transaction (isCurrent = true)', createdYearData.data.isCurrent, true);

    const yearId = createdYearData.data.id;

    // Verify previous current year was unset
    const currentYearsCount = await prisma.academicYear.count({ where: { isCurrent: true } });
    assertEqual('12. Exactly ONE academic year is current server-side', currentYearsCount, 1);

    // Revert current year back to seed year 2026/2027
    const seedYear = await prisma.academicYear.findUnique({ where: { name: '2026/2027' } });
    if (seedYear) {
      await fetch(`${BASE_URL}/admin/academic-years/${seedYear.id.toString()}/current`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
    }

    // --- TEST 5: Courses Domain ---
    const courseCode = `COURSE_${Date.now()}`;
    const createCourseRes = await fetch(`${BASE_URL}/admin/courses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subjectId: subjectId,
        academicYearId: yearId,
        code: courseCode,
        name: 'كورس الفيزياء التجريبي',
        defaultMonthlyFee: 400.0,
      }),
    });
    const createdCourseData = await createCourseRes.json();
    assertEqual('13. Admin create course (Status 201)', createCourseRes.status, 201);

    const courseId = createdCourseData.data.id;

    // --- TEST 6: Groups Domain & Schedule Validation ---
    const createGroupRes = await fetch(`${BASE_URL}/admin/groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: courseId,
        name: 'مجموعة الأحد التجريبية',
        maxCapacity: 25,
        schedules: [
          {
            dayOfWeek: 'SUNDAY',
            startTime: '14:00',
            endTime: '16:00',
            roomLocation: 'قاعة 202',
          },
        ],
      }),
    });
    const createdGroupData = await createGroupRes.json();
    assertEqual('14. Admin create group with schedules (Status 201)', createGroupRes.status, 201);
    assertEqual('15. Group schedule item count', createdGroupData.data.schedules.length, 1);

    // Test invalid schedule (startTime > endTime)
    const invalidGroupRes = await fetch(`${BASE_URL}/admin/groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: courseId,
        name: 'مجموعة غير صالحة',
        maxCapacity: 25,
        schedules: [
          {
            dayOfWeek: 'SUNDAY',
            startTime: '18:00',
            endTime: '16:00', // Invalid!
          },
        ],
      }),
    });
    assertEqual('16. Invalid schedule (startTime > endTime) rejected with 400', invalidGroupRes.status, 400);

    // --- TEST 7: Enrollments Domain & Locked Monthly Fee ---
    const createEnrollmentRes = await fetch(`${BASE_URL}/admin/enrollments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: newStudentId,
        courseId: courseId,
        academicYearId: yearId,
        monthlyFee: 300.0, // Agreed price locked at 300 EGP even if default course fee is 400 EGP
      }),
    });
    const createdEnrollmentData = await createEnrollmentRes.json();
    assertEqual('17. Admin create enrollment (Status 201)', createEnrollmentRes.status, 201);
    assertEqual('18. Locked agreed monthly fee retained', createdEnrollmentData.data.monthlyFee, '300');

    // Clean up created test enrollment and student user record
    await prisma.enrollment.delete({ where: { id: BigInt(createdEnrollmentData.data.id) } });
    await prisma.user.delete({ where: { id: BigInt(createdStudentData.data.userId) } });

  } catch (error) {
    console.error('Admin Test execution failed:', error);
  } finally {
    await teardown();
    const passedAll = results.every((r) => r.passed);
    console.log(`\n=== Admin Module Integration Tests Summary: ${passedAll ? 'PASS' : 'FAIL'} ===`);
    console.log(`Total tests run: ${results.length}`);
    console.log(`Passed: ${results.filter((r) => r.passed).length}`);
    console.log(`Failed: ${results.filter((r) => !r.passed).length}`);
    if (!passedAll) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runAdminTests();
