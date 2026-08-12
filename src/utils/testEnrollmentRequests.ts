import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';

const PORT = 5002;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Enrollment Test server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Enrollment Test server stopped');
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

async function runEnrollmentTests() {
  await setup();

  try {
    const testPhone = `01009998877`;
    const rejectPhone = `01001112233`;

    // Cleanup any existing test requests or accounts
    await prisma.enrollmentRequest.deleteMany({
      where: { phone: { in: [testPhone, rejectPhone] } },
    });
    const existingUsers = await prisma.user.findMany({
      where: { phone: { in: [testPhone, rejectPhone] } },
    });
    for (const u of existingUsers) {
      await prisma.student.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }

    // 1. Login Admin to obtain adminToken
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'DevPassword123!' }),
    });
    const adminData = await adminLoginRes.json();
    const adminToken = adminData.data.token;

    // Login Student to obtain studentToken
    const studentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
    });
    const studentData = await studentLoginRes.json();
    const studentToken = studentData.data.token;

    // 2. Submit valid enrollment request
    const validSubmitRes = await fetch(`${BASE_URL}/enrollment-requests/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'طالب جديد للاختبار',
        phone: testPhone,
        email: 'newstudent@example.com',
        grade: 'FIRST_SECONDARY',
        schoolName: 'مدرسة الثانوية للبنين',
        course: 'مادة البرمجة لطلب الانضمام',
        learningMode: 'IN_PERSON',
        notes: 'ملاحظات تجريبية للاختبار',
      }),
    });
    const validSubmitData = await validSubmitRes.json();
    assertEqual('1. Public user submits valid enrollment request (Status 201)', validSubmitRes.status, 201);
    assertEqual('1. Status is PENDING', validSubmitData.data.status, 'PENDING');
    const createdReqId = validSubmitData.data.id;

    // 3. Submit invalid request (missing name/phone)
    const invalidRes = await fetch(`${BASE_URL}/enrollment-requests/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: '', phone: '' }),
    });
    assertEqual('2. Invalid request is rejected (Status 400)', invalidRes.status, 400);

    // 4. Duplicate pending request prevention
    const duplicateRes = await fetch(`${BASE_URL}/enrollment-requests/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'طالب جديد مكرر',
        phone: testPhone,
        grade: 'FIRST_SECONDARY',
        course: 'مادة البرمجة',
      }),
    });
    const duplicateData = await duplicateRes.json();
    assertEqual('3. Duplicate pending request is prevented (Status 400)', duplicateRes.status, 400);
    assertEqual('3. Friendly message returned', duplicateData.message, 'عندك بالفعل طلب قيد المراجعة، وهنكون على تواصل معاك قريبًا.');

    // 5. Unauthenticated approval attempt
    const unauthApproveRes = await fetch(`${BASE_URL}/enrollment-requests/${createdReqId}/approve`, {
      method: 'POST',
    });
    assertEqual('4. Unauthenticated user cannot approve (Status 401)', unauthApproveRes.status, 401);

    // 6. Student role approval attempt
    const studentApproveRes = await fetch(`${BASE_URL}/enrollment-requests/${createdReqId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assertEqual('5. Student role cannot approve request (Status 403)', studentApproveRes.status, 403);

    // 7. Authorized Admin lists pending requests
    const listRes = await fetch(`${BASE_URL}/enrollment-requests?status=PENDING`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = await listRes.json();
    assertEqual('6. Authorized Admin can list pending requests (Status 200)', listRes.status, 200);
    assertEqual('6. Pending requests list returned', Array.isArray(listData.data), true);

    // 8. Authorized Admin approves request
    const approveRes = await fetch(`${BASE_URL}/enrollment-requests/${createdReqId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const approveData = await approveRes.json();
    assertEqual('7. Authorized Admin can approve request (Status 200)', approveRes.status, 200);
    assertEqual('7. Approved status', approveData.data.status, 'APPROVED');

    const createdUsername = approveData.data.createdStudent.username;
    assertEqual('8. Created Student username returned', typeof createdUsername, 'string');

    // Verify DB state for approval
    const dbReq = await prisma.enrollmentRequest.findUnique({ where: { id: BigInt(createdReqId) } });
    assertEqual('9. Enrollment request DB status is APPROVED', dbReq?.status, 'APPROVED');

    const dbUser = await prisma.user.findUnique({ where: { username: createdUsername } });
    assertEqual('9. Created User has STUDENT role', dbUser?.role, 'STUDENT');

    const dbStudent = await prisma.student.findUnique({ where: { userId: dbUser!.id } });
    assertEqual('9. Student profile created with correct grade', dbStudent?.grade, 'FIRST_SECONDARY');

    // 9. Submit a second request to test rejection
    const rejectSubmitRes = await fetch(`${BASE_URL}/enrollment-requests/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'طالب مرفوض للاختبار',
        phone: rejectPhone,
        grade: 'SECOND_SECONDARY',
        course: 'مادة برمجة أونلاين',
        learningMode: 'ONLINE',
      }),
    });
    const rejectSubmitData = await rejectSubmitRes.json();
    const rejectReqId = rejectSubmitData.data.id;

    // Admin rejects second request
    const rejectRes = await fetch(`${BASE_URL}/enrollment-requests/${rejectReqId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ rejectionReason: 'الصف الدراسي مكتمل الأعداد حالياً' }),
    });
    const rejectData = await rejectRes.json();
    assertEqual('10. Authorized Admin can reject request (Status 200)', rejectRes.status, 200);
    assertEqual('10. Rejected status', rejectData.data.status, 'REJECTED');
    assertEqual('10. Rejection reason stored', rejectData.data.rejectionReason, 'الصف الدراسي مكتمل الأعداد حالياً');

    // 10. Newly created Student logs in
    const newStudentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: createdUsername, password: 'stdPass123!' }),
    });
    const newStudentLoginData = await newStudentLoginRes.json();
    assertEqual('11. Newly created Student can log in (Status 200)', newStudentLoginRes.status, 200);
    assertEqual('11. Role is STUDENT', newStudentLoginData.data.user.role, 'STUDENT');

    const newStudentToken = newStudentLoginData.data.token;

    // 11. Newly created Student accesses /me
    const newStudentMeRes = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${newStudentToken}` },
    });
    const newStudentMeData = await newStudentMeRes.json();
    assertEqual('12. Newly created Student can access /me (Status 200)', newStudentMeRes.status, 200);
    assertEqual('12. Profile retrieved', newStudentMeData.data.username, createdUsername);

  } catch (error) {
    console.error('Enrollment test execution failed:', error);
  } finally {
    await teardown();
    const passedAll = results.every((r) => r.passed);
    console.log(`\n=== Enrollment Flow Tests Summary: ${passedAll ? 'PASS' : 'FAIL'} ===`);
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

runEnrollmentTests();
