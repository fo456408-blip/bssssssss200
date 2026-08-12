import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';

const PORT = 5001;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Test server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Test server stopped');
      resolve();
    });
  });
}

interface TestResult {
  scenario: string;
  passed: boolean;
  message?: string;
  status?: number;
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

async function runTests() {
  await setup();

  try {
    // Fetch seeded student IDs for the authorization check test (Scenario 15)
    const studentsObj = await prisma.student.findMany({
      include: { user: true },
    });
    const ahmedStudent = studentsObj.find((s) => s.user.username === 'ahmed_student')!;
    const omarStudent = studentsObj.find((s) => s.user.username === 'omar_student')!;

    // 1. Successful Admin login
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'DevPassword123!' }),
    });
    const adminData = await adminLoginRes.json();
    assertEqual('1. Successful Admin login', adminLoginRes.status, 200);
    assertEqual('1. Successful Admin login (Token type)', typeof adminData.data.token, 'string');
    assertEqual('1. Successful Admin login (Role)', adminData.data.user.role, 'ADMIN');

    const adminToken = adminData.data.token;

    // 2. Successful Teacher login
    const teacherLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ahmed_teacher', password: 'DevPassword123!' }),
    });
    const teacherData = await teacherLoginRes.json();
    assertEqual('2. Successful Teacher login', teacherLoginRes.status, 200);
    assertEqual('2. Successful Teacher login (Role)', teacherData.data.user.role, 'TEACHER');

    const teacherToken = teacherData.data.token;

    // 3. Successful Student login
    const studentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
    });
    const studentData = await studentLoginRes.json();
    assertEqual('3. Successful Student login', studentLoginRes.status, 200);
    assertEqual('3. Successful Student login (Role)', studentData.data.user.role, 'STUDENT');

    const studentToken = studentData.data.token;

    // 4. Successful Parent login
    const parentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mohamed_parent', password: 'DevPassword123!' }),
    });
    const parentData = await parentLoginRes.json();
    assertEqual('4. Successful Parent login', parentLoginRes.status, 200);
    assertEqual('4. Successful Parent login (Role)', parentData.data.user.role, 'PARENT');

    // 5. Wrong password
    const wrongPasswordRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'WrongPassword' }),
    });
    const wrongPasswordData = await wrongPasswordRes.json();
    assertEqual('5. Wrong password (Status)', wrongPasswordRes.status, 401);
    assertEqual('5. Wrong password (Generic error)', wrongPasswordData.message, 'اسم المستخدم أو كلمة المرور غير صحيحة.');

    // 6. Unknown username
    const unknownUsernameRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'unknown_user_name', password: 'DevPassword123!' }),
    });
    const unknownUsernameData = await unknownUsernameRes.json();
    assertEqual('6. Unknown username (Status)', unknownUsernameRes.status, 401);
    assertEqual('6. Unknown username (Generic error)', unknownUsernameData.message, 'اسم المستخدم أو كلمة المرور غير صحيحة.');

    // 7. Inactive user
    // Temporarily set a user to inactive
    await prisma.user.update({
      where: { username: 'omar_student' },
      data: { isActive: false },
    });

    const inactiveUserRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'omar_student', password: 'DevPassword123!' }),
    });
    assertEqual('7. Inactive user (Status)', inactiveUserRes.status, 401);

    // Revert active status
    await prisma.user.update({
      where: { username: 'omar_student' },
      data: { isActive: true },
    });

    // 8. Missing credentials
    const missingCredRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '' }),
    });
    assertEqual('8. Missing credentials (Status)', missingCredRes.status, 400);

    // 9. Invalid JWT token
    const invalidJwtRes = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer NotAValidTokenValueAtAll' },
    });
    assertEqual('9. Invalid JWT token (Status)', invalidJwtRes.status, 401);

    // 10. Expired/Malformed JWT
    const malformedJwtRes = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload' },
    });
    assertEqual('10. Expired/Malformed JWT (Status)', malformedJwtRes.status, 401);

    // 11. Protected endpoint without token
    const noTokenRes = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
    });
    assertEqual('11. Protected endpoint without token (Status)', noTokenRes.status, 401);

    // 12. Protected endpoint with valid token
    const validTokenRes = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    const validTokenData = await validTokenRes.json();
    assertEqual('12. Protected endpoint with valid token (Status)', validTokenRes.status, 200);
    assertEqual('12. Protected endpoint with valid token (Data validation)', validTokenData.data.username, 'ahmed_student');

    // 13. Admin-only endpoint accessed by Student (Should be 403)
    const adminEndpointRes = await fetch(`${BASE_URL}/auth/test-admin`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    assertEqual('13. Admin-only endpoint accessed by Student (Status)', adminEndpointRes.status, 403);

    // 14. Teacher accessing Teacher-authorized endpoint
    const teacherEndpointRes = await fetch(`${BASE_URL}/auth/test-teacher`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${teacherToken}` },
    });
    assertEqual('14. Teacher accessing Teacher endpoint (Status)', teacherEndpointRes.status, 200);

    // 15. Student accessing another student's protected data must be rejected
    // ahmed_student attempts to access omar_student data
    const accessDeniedRes = await fetch(`${BASE_URL}/auth/student-data/${omarStudent.id.toString()}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    assertEqual('15. Student accessing another student data (Status)', accessDeniedRes.status, 403);

    // student 1 attempts to access their own data (Should be allowed)
    const accessAllowedRes = await fetch(`${BASE_URL}/auth/student-data/${ahmedStudent.id.toString()}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    assertEqual('15. Student accessing own student data (Status)', accessAllowedRes.status, 200);

    // 16. Logout test (Authenticated POST /auth/logout)
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    assertEqual('16. Authenticated logout endpoint (Status)', logoutRes.status, 200);

  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    await teardown();
    const passedAll = results.every((r) => r.passed);
    console.log(`\n=== Authentication Tests Summary: ${passedAll ? 'PASS' : 'FAIL'} ===`);
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

runTests();
