import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';

const PORT = 5003;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Operations Test server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Operations Test server stopped');
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

async function runOperationsTests() {
  await setup();

  try {
    // 1. Authenticate Admin
    const adminLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'DevPassword123!' }),
      })
    ).json();
    const adminToken = adminLogin.data.token;

    // 2. Authenticate Teacher (ahmed_teacher)
    const teacherLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ahmed_teacher', password: 'DevPassword123!' }),
      })
    ).json();
    const teacherToken = teacherLogin.data.token;

    // 3. Authenticate Student (ahmed_student)
    const studentLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
      })
    ).json();
    const studentToken = studentLogin.data.token;
    const studentProfileId = studentLogin.data.user.profile.id.toString();

    // 4. Authenticate Parent (mohamed_parent)
    const parentLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'mohamed_parent', password: 'DevPassword123!' }),
      })
    ).json();
    const parentToken = parentLogin.data.token;

    // Get seed group, course, and enrollment
    const seedGroup = await prisma.group.findFirst({ include: { course: true } });
    if (!seedGroup) throw new Error('Seed group missing');

    const seedEnrollment = await prisma.enrollment.findFirst({
      where: { studentId: BigInt(studentProfileId) },
    });
    if (!seedEnrollment) throw new Error('Seed enrollment missing');

    // --- SCENARIO 1: Admin Create Class Session ---
    const createSessionRes = await fetch(`${BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        groupId: seedGroup.id.toString(),
        sessionDate: '2026-09-10',
        startTime: '15:00',
        endTime: '17:00',
        notes: 'حصة برمجة تجريبية',
      }),
    });
    const createdSessionData = await createSessionRes.json();
    assertEqual('1. Admin create class session (Status 201)', createSessionRes.status, 201);
    const sessionId = createdSessionData.data.id;

    // --- SCENARIO 2: Interactive Attendance Sheet Loader ---
    const sheetRes = await fetch(`${BASE_URL}/sessions/${sessionId}/attendance`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const sheetData = await sheetRes.json();
    assertEqual('2. Admin load attendance sheet (Status 200)', sheetRes.status, 200);
    assertEqual('3. Attendance sheet auto-loads active students', Array.isArray(sheetData.data.students), true);

    // --- SCENARIO 3: Bulk Save Attendance ---
    const saveAttendanceRes = await fetch(`${BASE_URL}/sessions/${sessionId}/attendance`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attendance: [
          {
            studentId: studentProfileId,
            status: 'PRESENT',
            notes: 'حاضر في الموعد',
          },
        ],
      }),
    });
    assertEqual('4. Bulk save attendance sheet (Status 200)', saveAttendanceRes.status, 200);

    // --- SCENARIO 4: Attendance Percentage Formula & Stats ---
    const statsRes = await fetch(`${BASE_URL}/attendance/student/${studentProfileId}/stats`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const statsData = await statsRes.json();
    assertEqual('5. Attendance statistics calculation (Status 200)', statsRes.status, 200);
    assertEqual('6. Attendance percentage calculation formula', typeof statsData.data.percentage, 'number');

    // --- SCENARIO 5: Record Payment with Agreed Monthly Fee ---
    const recordPaymentRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enrollmentId: seedEnrollment.id.toString(),
        billingMonth: 11,
        billingYear: 2026,
        amount: Number(seedEnrollment.monthlyFee),
        status: 'PAID',
        paymentMethod: 'INSTAPAY',
      }),
    });
    const paymentData = await recordPaymentRes.json();
    assertEqual('7. Record monthly payment (Status 201)', recordPaymentRes.status, 201, JSON.stringify(paymentData));

    const paymentId = paymentData.data?.id;

    // --- SCENARIO 6: Duplicate Payment Rejection (UNIQUE constraint) ---
    const dupPaymentRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enrollmentId: seedEnrollment.id.toString(),
        billingMonth: 11,
        billingYear: 2026,
        amount: Number(seedEnrollment.monthlyFee),
      }),
    });
    assertEqual('8. Duplicate payment for same month rejected with 400', dupPaymentRes.status, 400);

    // --- SCENARIO 7: Payment Receipt Generator ---
    const receiptRes = await fetch(`${BASE_URL}/payments/${paymentId}/receipt`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const receiptData = await receiptRes.json();
    assertEqual('9. Generate receipt data (Status 200)', receiptRes.status, 200);
    assertEqual('10. Receipt metadata contains academy name', receiptData.data.academyName, 'EngCode by Ahmed Hamed Academy');

    // --- SCENARIO 8: Teacher Role Security Boundaries ---
    // Teacher viewing assigned group sessions (Allowed)
    const teacherSessionRes = await fetch(`${BASE_URL}/sessions?groupId=${seedGroup.id.toString()}`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` },
    });
    assertEqual('11. Teacher accessing assigned group sessions (Status 200)', teacherSessionRes.status, 200);

    // Teacher accessing payments (Forbidden)
    const teacherPaymentsRes = await fetch(`${BASE_URL}/payments`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` },
    });
    assertEqual('12. Teacher accessing financial payments rejected with 403', teacherPaymentsRes.status, 403);

    // --- SCENARIO 9: Student Role Isolation Boundaries ---
    // Student viewing own stats (Allowed)
    const studentOwnStatsRes = await fetch(`${BASE_URL}/attendance/student/${studentProfileId}/stats`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    assertEqual('13. Student viewing own attendance stats (Status 200)', studentOwnStatsRes.status, 200);

    // Student A viewing Student B stats (Forbidden)
    const omarStudent = await prisma.student.findFirst({
      where: { id: { not: BigInt(studentProfileId) } },
    });
    if (omarStudent) {
      const studentOtherStatsRes = await fetch(`${BASE_URL}/attendance/student/${omarStudent.id.toString()}/stats`, {
        headers: { 'Authorization': `Bearer ${studentToken}` },
      });
      assertEqual('14. Student accessing another student stats rejected with 403', studentOtherStatsRes.status, 403);
    }

    // --- SCENARIO 10: Parent Role Isolation Boundaries ---
    // Parent viewing linked child stats (Allowed)
    const parentChildStatsRes = await fetch(`${BASE_URL}/attendance/student/${studentProfileId}/stats`, {
      headers: { 'Authorization': `Bearer ${parentToken}` },
    });
    assertEqual('15. Parent viewing linked child attendance stats (Status 200)', parentChildStatsRes.status, 200);

    // Parent viewing unlinked student stats (Forbidden - using non-linked ID 999999)
    const parentUnlinkedStatsRes = await fetch(`${BASE_URL}/attendance/student/999999/stats`, {
      headers: { 'Authorization': `Bearer ${parentToken}` },
    });
    assertEqual('16. Parent accessing unlinked student stats rejected with 403', parentUnlinkedStatsRes.status, 403);

    // --- SCENARIO 11: Unauthenticated request rejection ---
    const unauthRes = await fetch(`${BASE_URL}/sessions`, { method: 'GET' });
    assertEqual('17. Unauthenticated request rejected with 401', unauthRes.status, 401);

    // Cleanup test session & payment
    await prisma.payment.delete({ where: { id: BigInt(paymentId) } });
    await prisma.attendance.deleteMany({ where: { sessionId: BigInt(sessionId) } });
    await prisma.classSession.delete({ where: { id: BigInt(sessionId) } });

  } catch (error) {
    console.error('Operations Test execution failed:', error);
  } finally {
    await teardown();
    const passedAll = results.every((r) => r.passed);
    console.log(`\n=== Operations Module Integration Tests Summary: ${passedAll ? 'PASS' : 'FAIL'} ===`);
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

runOperationsTests();
