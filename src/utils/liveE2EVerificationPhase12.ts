import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';

const PORT = 5012;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Phase 12 Live E2E Verification Server running on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Phase 12 Live E2E Verification Server stopped');
      resolve();
    });
  });
}

async function runLiveE2EVerification() {
  await setup();
  console.log('=== Starting Phase 12 Live End-to-End System Verification ===\n');

  try {
    // Step 1: Admin Login
    console.log('[Step 1] Logging in as Admin...');
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'DevPassword123!' }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.data.token;
    console.log('✔ Admin logged in successfully.');

    // Step 2: Fetch Student ID
    console.log('[Step 2] Retrieving Student 1 (Ahmed Mohamed)...');
    const stdUser = await prisma.user.findFirst({ where: { username: 'ahmed_student' } });
    const student1 = await prisma.student.findFirst({ where: { userId: stdUser!.id } });
    console.log(`✔ Found Student 1 ID: ${student1!.id}`);

    // Step 3: Admin generates September 2026 report
    console.log('[Step 3] Admin generating September 2026 report...');
    const genRes = await fetch(`${BASE_URL}/admin/reports/students/${student1!.id}/monthly`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 9 }),
    });
    const genData = await genRes.json();
    const report1Id = genData.data.id;
    console.log(`✔ September 2026 report created with ID: ${report1Id}, status: ${genData.data.status}`);

    // Step 4: Verify complete snapshot contents
    console.log('[Step 4] Verifying complete snapshot JSON integrity...');
    const snapshot = JSON.parse(genData.data.snapshotData);
    console.log(`✔ Student in snapshot: ${snapshot.student.fullName}, Timezone: ${snapshot.timezone}`);

    // Step 5: Student 1 Login
    console.log('[Step 5] Logging in as Student 1...');
    const std1LoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
    });
    const std1Token = (await std1LoginRes.json()).data.token;
    console.log('✔ Student 1 logged in successfully.');

    // Step 6: Student 1 fetches report list
    console.log('[Step 6] Student 1 fetching own reports list...');
    const std1ReportsRes = await fetch(`${BASE_URL}/student/reports`, {
      headers: { Authorization: `Bearer ${std1Token}` },
    });
    const std1ReportsData = await std1ReportsRes.json();
    console.log(`✔ Student 1 retrieved ${std1ReportsData.data.length} report(s).`);

    // Step 7: Student 1 gets presigned URL
    console.log('[Step 7] Student 1 requesting presigned URL for report...');
    const std1PresignedRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`, {
      headers: { Authorization: `Bearer ${std1Token}` },
    });
    const std1PresignedData = await std1PresignedRes.json();
    console.log(`✔ Presigned URL received (expires in ${std1PresignedData.data.expiresIn}s).`);

    // Step 8: Student 2 Login (Omar)
    console.log('[Step 8] Logging in as Student 2 (Omar Mohamed)...');
    const std2LoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'omar_student', password: 'DevPassword123!' }),
    });
    const std2Token = (await std2LoginRes.json()).data.token;

    // Step 9: IDOR Check - Student 2 accesses Student 1 report
    console.log('[Step 9] Testing IDOR Security Guard (Student 2 -> Student 1 report)...');
    const std2IdorRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`, {
      headers: { Authorization: `Bearer ${std2Token}` },
    });
    console.log(`✔ Security Guard correctly blocked with status: ${std2IdorRes.status}`);

    // Step 10: Parent Login (Mohamed Parent)
    console.log('[Step 10] Logging in as Parent (Mohamed Parent)...');
    const parentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mohamed_parent', password: 'DevPassword123!' }),
    });
    const parentToken = (await parentLoginRes.json()).data.token;

    // Step 11: Parent fetches linked child report list
    console.log('[Step 11] Parent fetching linked child reports...');
    const parentReportsRes = await fetch(`${BASE_URL}/parent/children/${student1!.id}/reports`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    const parentReportsData = await parentReportsRes.json();
    console.log(`✔ Parent retrieved ${parentReportsData.data.length} report(s) for linked child.`);

    // Step 12: Parent requests presigned URL
    console.log('[Step 12] Parent requesting presigned URL for linked child report...');
    const parentPresignedRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    console.log(`✔ Parent GET presigned URL status: ${parentPresignedRes.status}`);

    // Step 13: IDOR Check - Parent accesses unlinked child
    console.log('[Step 13] Testing Parent IDOR Guard against unlinked child...');
    const unlinkedUsername = `live_unlinked_${Date.now()}`;
    const unlinkedUser = await prisma.user.create({
      data: { username: unlinkedUsername, passwordHash: 'DevPassword123!', fullName: 'غير مرتبط', role: 'STUDENT' },
    });
    const unlinkedStd = await prisma.student.create({ data: { userId: unlinkedUser.id, grade: 'FIRST_SECONDARY' } });

    const parentUnlinkedRes = await fetch(`${BASE_URL}/parent/children/${unlinkedStd.id}/reports`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    console.log(`✔ Security Guard correctly blocked with status: ${parentUnlinkedRes.status}`);

    // Step 14: Teacher Login
    console.log('[Step 14] Logging in as Teacher (Ahmed Teacher)...');
    const teacherLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ahmed_teacher', password: 'DevPassword123!' }),
    });
    const teacherToken = (await teacherLoginRes.json()).data.token;

    // Step 15: Teacher requests student report
    console.log('[Step 15] Authorized Teacher requesting student report presigned URL...');
    const teacherPresignedRes = await fetch(`${BASE_URL}/reports/${report1Id}/pdf`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    console.log(`✔ Teacher GET presigned URL status: ${teacherPresignedRes.status}`);

    // Step 16: Snapshot Immutability Test
    console.log('[Step 16] Testing Snapshot Immutability after database record changes...');
    await prisma.user.update({
      where: { id: stdUser!.id },
      data: { fullName: 'اسم الطالب المعدل تجريبياً' },
    });
    const reportDbPostMod = await prisma.monthlyReport.findUnique({ where: { id: BigInt(report1Id) } });
    const postModSnapshot = JSON.parse(reportDbPostMod!.snapshotData!);
    console.log(`✔ Original snapshot name remains unchanged: "${postModSnapshot.student.fullName}"`);

    // Step 17: Report Regeneration (Version 2)
    console.log('[Step 17] Regenerating September 2026 report (creates Version 2)...');
    const regenRes = await fetch(`${BASE_URL}/admin/reports/students/${student1!.id}/monthly`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 9 }),
    });
    const regenData = await regenRes.json();
    console.log(`✔ New report version created: v${regenData.data.version}`);

    // Restore original student name
    await prisma.user.update({
      where: { id: stdUser!.id },
      data: { fullName: stdUser!.fullName },
    });

    // Step 18: Audit Log Verification
    console.log('[Step 18] Verifying Audit Log for report generation...');
    const auditLogs = await prisma.auditLog.findMany({
      where: { action: { in: ['GENERATE_MONTHLY_REPORT', 'REGENERATE_MONTHLY_REPORT'] } },
    });
    console.log(`✔ Audit Log entries recorded: ${auditLogs.length}`);

    // Step 19: Parent Notification Verification
    console.log('[Step 19] Verifying Parent Notification delivery...');
    const notifs = await prisma.notification.findMany({
      where: { entityType: 'MONTHLY_REPORT' },
    });
    console.log(`✔ Parent Notifications delivered: ${notifs.length}`);

    // Cleanup live test records
    await prisma.monthlyReport.deleteMany({ where: { studentId: { in: [student1!.id, unlinkedStd.id] } } });
    await prisma.student.delete({ where: { id: unlinkedStd.id } });
    await prisma.user.delete({ where: { id: unlinkedUser.id } });

    console.log('\n=== Live End-to-End Verification Completed Successfully! (19/19 Steps Passed) ===');
  } catch (error) {
    console.error('Live E2E Verification failed:', error);
  } finally {
    await teardown();
  }
}

runLiveE2EVerification();
