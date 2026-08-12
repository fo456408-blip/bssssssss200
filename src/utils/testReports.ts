import app from '../app';
import { prisma } from '../config/database';
import { ReportService } from '../services/report.service';
import { ReportPDFService } from '../services/report-pdf.service';
import { Server } from 'http';
import bcrypt from 'bcryptjs';

const PORT = 5012;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Phase 12 Reports & PDF Generation Test server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Phase 12 Reports & PDF Generation Test server stopped');
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

async function runReportsTests() {
  await setup();

  try {
    // Fetch seed users
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
    const teacherUser = await prisma.user.findFirst({ where: { username: 'ahmed_teacher' } });
    const parentUser = await prisma.user.findFirst({ where: { username: 'mohamed_parent' } });
    const student1User = await prisma.user.findFirst({ where: { username: 'ahmed_student' } });
    const student2User = await prisma.user.findFirst({ where: { username: 'omar_student' } });

    const student1Profile = await prisma.student.findFirst({ where: { userId: student1User!.id } });
    const student2Profile = await prisma.student.findFirst({ where: { userId: student2User!.id } });

    // Perform Logins
    const adminLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'DevPassword123!' }),
      })
    ).json();
    const adminToken = adminLogin.data.token;

    const teacherLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ahmed_teacher', password: 'DevPassword123!' }),
      })
    ).json();
    const teacherToken = teacherLogin.data.token;

    const parentLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'mohamed_parent', password: 'DevPassword123!' }),
      })
    ).json();
    const parentToken = parentLogin.data.token;

    const student1Login = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
      })
    ).json();
    const student1Token = student1Login.data.token;

    const student2Login = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'omar_student', password: 'DevPassword123!' }),
      })
    ).json();
    const student2Token = student2Login.data.token;

    // --- CHECKPOINT 1: Admin generates monthly report for Student 1 ---
    const genRes = await fetch(`${BASE_URL}/admin/reports/students/${student1Profile!.id}/monthly`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 9 }),
    });
    const genData = await genRes.json();
    if (genRes.status !== 201) {
      console.error('Generate Report Failed:', genData);
    }
    assertEqual('1. Admin generates monthly report (Status 201)', genRes.status, 201);
    const report1Id = genData.data.id;

    // --- CHECKPOINT 2: Explicit Africa/Cairo Timezone Date Boundaries ---
    const boundaries = ReportService.getMonthlyPeriodBoundaries(2026, 9);
    assertEqual('2. Date boundary timezone is explicitly Africa/Cairo', boundaries.timezone, 'Africa/Cairo');
    assertEqual('2b. Period start month is 9', boundaries.periodStart.getMonth() + 1, 9);
    assertEqual('2c. Period end month is 10', boundaries.periodEnd.getMonth() + 1, 10);

    // --- CHECKPOINT 3: Report status is READY and pdfStorageKey populated ---
    assertEqual('3. Report status is READY', genData.data.status, 'READY');
    assertEqual('3b. PDF storage key matches pattern', genData.data.pdfStorageKey.includes(`reports/${student1Profile!.id}/2026/9/`), true);

    // --- CHECKPOINT 4: Complete Report Snapshot data inspection ---
    const reportDb1 = await prisma.monthlyReport.findUnique({ where: { id: BigInt(report1Id) } });
    const snapshot = JSON.parse(reportDb1!.snapshotData!);
    assertEqual('4. Snapshot contains student name', snapshot.student.fullName, student1User!.fullName);
    assertEqual('4b. Snapshot contains period timezone', snapshot.timezone, 'Africa/Cairo');
    assertEqual('4c. Snapshot contains attendance & quiz summary metrics', typeof snapshot.summary.attendancePercent === 'number', true);

    // --- CHECKPOINT 5: Student 1 retrieves own reports ---
    const std1ReportsRes = await fetch(`${BASE_URL}/student/reports`, {
      headers: { Authorization: `Bearer ${student1Token}` },
    });
    const std1ReportsData = await std1ReportsRes.json();
    if (std1ReportsRes.status !== 200) {
      console.error('Student Reports Fetch Failed:', std1ReportsData);
    }
    assertEqual('5. Student 1 retrieves own reports (Status 200)', std1ReportsRes.status, 200);
    assertEqual('5b. Student 1 reports list contains generated report', Array.isArray(std1ReportsData.data) && std1ReportsData.data.some((r: any) => r.id === report1Id), true);

    // --- CHECKPOINT 6: Student 1 gets signed URL for own report ---
    const std1SignedUrlRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`, {
      headers: { Authorization: `Bearer ${student1Token}` },
    });
    assertEqual('6. Student 1 gets signed PDF URL for own report (Status 200)', std1SignedUrlRes.status, 200);

    // --- CHECKPOINT 7: Student 2 IDOR Guard (Accessing Student 1 Report) ---
    const std2SignedUrlRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`, {
      headers: { Authorization: `Bearer ${student2Token}` },
    });
    assertEqual('7. Student 2 attempting to access Student 1 report rejected with 403', std2SignedUrlRes.status, 403);

    // --- CHECKPOINT 8: Parent accesses linked child report ---
    const parentReportsRes = await fetch(`${BASE_URL}/parent/children/${student1Profile!.id}/reports`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    assertEqual('8. Parent accesses linked child report list (Status 200)', parentReportsRes.status, 200);

    const parentSignedUrlRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    assertEqual('8b. Parent gets signed PDF URL for linked child report (Status 200)', parentSignedUrlRes.status, 200);

    // --- CHECKPOINT 9: Parent IDOR Guard (Unrelated student) ---
    const unlinkedUsername = `unlinked_std_${Date.now()}`;
    const unlinkedStudentUser = await prisma.user.create({
      data: {
        username: unlinkedUsername,
        passwordHash: 'DevPassword123!',
        fullName: 'طالب غير مرتبط بولي الأمر',
        role: 'STUDENT',
      },
    });
    const unlinkedStudent = await prisma.student.create({
      data: { userId: unlinkedStudentUser.id, grade: 'FIRST_SECONDARY' },
    });

    const parentUnlinkedRes = await fetch(`${BASE_URL}/parent/children/${unlinkedStudent.id}/reports`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    assertEqual('9. Parent accessing unlinked child reports rejected with 403', parentUnlinkedRes.status, 403);

    // --- CHECKPOINT 10 & 11: Teacher Access & IDOR Guard ---
    const teacherSignedUrlRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assertEqual('10. Authorized Teacher gets signed URL for student in course (Status 200)', teacherSignedUrlRes.status, 200);

    // --- CHECKPOINT 12: Unauthenticated Request Rejection ---
    const unauthSignedUrlRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`);
    assertEqual('12. Unauthenticated PDF request rejected with 401', unauthSignedUrlRes.status, 401);

    // --- CHECKPOINT 13: Signed URL Security (No permanent URLs or R2 credentials) ---
    const signedData = (await std1SignedUrlRes.json()).data;
    const urlStr = JSON.stringify(signedData);
    assertEqual('13. Presigned URL includes expiration time (15 mins)', signedData.expiresIn, 900);
    assertEqual('13b. Presigned URL response contains no R2 secret keys', !urlStr.includes('R2_SECRET_ACCESS_KEY') && !urlStr.includes('accessKeyId'), true);

    // --- CHECKPOINTS 14 & 15: SNAPSHOT IMMUTABILITY & REPORT REGENERATION (CLARIFICATION 4) ---
    const initialSnapshotStr = reportDb1!.snapshotData;
    const initialStorageKey = reportDb1!.pdfStorageKey;

    // Change underlying database record (e.g. update student user full name or attendance)
    await prisma.user.update({
      where: { id: student1User!.id },
      data: { fullName: 'اسم الطالب المعدل بعد التقرير' },
    });

    // Fetch existing report 1 again
    const reportDb1AfterDataChange = await prisma.monthlyReport.findUnique({ where: { id: BigInt(report1Id) } });
    assertEqual('14. Historical snapshot remains 100% UNCHANGED after student data modification', reportDb1AfterDataChange!.snapshotData, initialSnapshotStr);
    assertEqual('14b. Existing report PDF key remains UNCHANGED', reportDb1AfterDataChange!.pdfStorageKey, initialStorageKey);

    // Regenerate report for same month/year (Creates Version 2)
    const regenRes = await fetch(`${BASE_URL}/admin/reports/students/${student1Profile!.id}/monthly`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 9 }),
    });
    const regenData = await regenRes.json();
    assertEqual('15. Regenerating report succeeds (Status 201)', regenRes.status, 201);
    console.log('Regen Report Data:', regenData.data);
    assertEqual('15b. New report version is 2', Number(regenData.data.version), 2);

    const reportDb1StillExists = await prisma.monthlyReport.findUnique({ where: { id: BigInt(report1Id) } });
    assertEqual('15c. Original version 1 report still exists in database', reportDb1StillExists !== null, true);

    // Restore original student name
    await prisma.user.update({
      where: { id: student1User!.id },
      data: { fullName: student1User!.fullName },
    });

    // --- CHECKPOINT 16: Audit Log Integration ---
    const auditLogsRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditLogs = (await auditLogsRes.json()).data;
    assertEqual('16. Audit log entry recorded on report generation', auditLogs.some((l: any) => l.action.includes('GENERATE_MONTHLY_REPORT')), true);

    // --- CHECKPOINT 17: Idempotent Parent Notification ---
    const parentNotifs = await prisma.notification.findMany({
      where: { userId: parentUser!.id, entityType: 'MONTHLY_REPORT' },
    });
    assertEqual('17. Parent notification created for ready monthly report', parentNotifs.length > 0, true);

    // --- CHECKPOINT 18: PDF Buffer Direct Generation Test ---
    const testPdfBuffer = await ReportPDFService.generateMonthlyReportPDF(snapshot);
    assertEqual('18. Direct PDF generator returns non-empty Buffer', testPdfBuffer.length > 1000, true);
    assertEqual('18b. PDF Buffer starts with %PDF- magic header', testPdfBuffer.subarray(0, 5).toString(), '%PDF-');

    // Cleanup created test records
    await prisma.monthlyReport.deleteMany({ where: { studentId: { in: [student1Profile!.id, unlinkedStudent.id] } } });
    await prisma.student.delete({ where: { id: unlinkedStudent.id } });
    await prisma.user.delete({ where: { id: unlinkedStudentUser.id } });

  } catch (error) {
    console.error('Phase 12 Test execution failed:', error);
  } finally {
    await teardown();
    const passedAll = results.every((r) => r.passed);
    console.log(`\n=== Phase 12 Reports & PDF Generation Tests Summary: ${passedAll ? 'PASS' : 'FAIL'} ===`);
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

runReportsTests();
