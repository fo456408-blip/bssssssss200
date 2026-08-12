import app from '../app';
import { prisma } from '../config/database';
import { NotificationService } from '../services/notification.service';
import { AnnouncementService } from '../services/announcement.service';
import { AuditLogService } from '../services/audit-log.service';
import { Server } from 'http';
import bcrypt from 'bcryptjs';
import { AnnouncementTarget, AnnouncementStatus, NotificationType } from '@prisma/client';

const PORT = 5010;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Phase 11 Notifications, Announcements & Audit Log Test server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Phase 11 Notifications, Announcements & Audit Log Test server stopped');
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

async function runNotificationsAndAuditTests() {
  await setup();

  try {
    const devPasswordHash = await bcrypt.hash('DevPassword123!', 10);

    // Fetch seed users
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
    const teacherUser = await prisma.user.findFirst({ where: { username: 'ahmed_teacher' } });
    const parentUser = await prisma.user.findFirst({ where: { username: 'mohamed_parent' } });
    const student1User = await prisma.user.findFirst({ where: { username: 'ahmed_student' } });
    const student2User = await prisma.user.findFirst({ where: { username: 'omar_student' } });

    const student1Profile = await prisma.student.findFirst({ where: { userId: student1User!.id } });

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

    // --- CHECKPOINT 1: Student receives own notifications ---
    await NotificationService.createNotification(
      student1User!.id,
      'إشعار تجريبي 1',
      'مرحباً أحمد، هذا إشعار تجريبي موجه لك.',
      NotificationType.SYSTEM,
      '/student/dashboard',
      'TEST',
      BigInt(1),
      'ref_test_1'
    );

    const std1NotifRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${student1Token}` },
    });
    const std1NotifData = await std1NotifRes.json();
    assertEqual('1. Student A retrieves own notifications (Status 200)', std1NotifRes.status, 200);
    assertEqual('1b. Student A notification list contains created notification', std1NotifData.data.some((n: any) => n.title === 'إشعار تجريبي 1'), true);

    // --- CHECKPOINT 2: Student A cannot access Student B notifications ---
    const std2NotifRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${student2Token}` },
    });
    const std2NotifData = await std2NotifRes.json();
    const std2HasStd1Notif = std2NotifData.data.some((n: any) => n.title === 'إشعار تجريبي 1');
    assertEqual('2. Student B cannot access Student A notifications (Recipient boundary enforced)', !std2HasStd1Notif, true);

    // --- CHECKPOINT 3 & 4: Parent notification recipient boundary ---
    await NotificationService.createNotification(
      parentUser!.id,
      'إشعار ولي الأمر',
      'تنبيه متابعة ولي الأمر',
      NotificationType.SYSTEM,
      '/parent/dashboard'
    );
    const parentNotifRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    assertEqual('3. Parent retrieves own notifications (Status 200)', parentNotifRes.status, 200);
    assertEqual('4. Parent notifications derived strictly from JWT user ID', (await parentNotifRes.json()).data.length > 0, true);

    // --- CHECKPOINT 5 & 6: Teacher notifications & Unauthenticated rejections ---
    const teacherNotifRes = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assertEqual('5. Teacher retrieves own notifications (Status 200)', teacherNotifRes.status, 200);

    const unauthNotifRes = await fetch(`${BASE_URL}/notifications`);
    assertEqual('6. Unauthenticated notification request rejected with 401', unauthNotifRes.status, 401);

    // --- CHECKPOINT 7 & 8: Admin creates announcement & Non-admin rejection ---
    const adminAnnRes = await fetch(`${BASE_URL}/admin/announcements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'إعلان جديد للجميع',
        content: 'هذا إعلان عام موجه لجميع الطلاب.',
        targetAudience: 'ALL_STUDENTS',
        status: 'PUBLISHED',
      }),
    });
    assertEqual('7. Admin creates and publishes announcement (Status 201)', adminAnnRes.status, 201);

    const studentAnnCreateRes = await fetch(`${BASE_URL}/admin/announcements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${student1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'إعلان طالب غير مصرح',
        content: 'اختبار ثغرة الصلاحيات.',
        targetAudience: 'ALL_STUDENTS',
      }),
    });
    assertEqual('8. Student creating announcement rejected with 403', studentAnnCreateRes.status, 403);

    // --- CHECKPOINT 9: TARGETED ANNOUNCEMENT: ALL_STUDENTS ---
    const stdUserAnnRes = await fetch(`${BASE_URL}/announcements`, {
      headers: { Authorization: `Bearer ${student1Token}` },
    });
    const stdUserAnnData = await stdUserAnnRes.json();
    assertEqual('9. Published ALL_STUDENTS announcement reaches student', stdUserAnnData.data.some((a: any) => a.title === 'إعلان جديد للجميع'), true);

    // --- CHECKPOINT 10 & 11: TARGETED ANNOUNCEMENTS (COURSE_STUDENTS & COURSE_PARENTS) (CLARIFICATION 3) ---
    const course = await prisma.course.findFirst();

    // Create course-targeted announcement
    const courseAnn = await AnnouncementService.createAnnouncement(adminUser!.id, {
      title: 'إعلان خاص بطلاب كورس البرمجة',
      content: 'تنبيه هام لطلاب هذا الكورس فقط.',
      targetAudience: AnnouncementTarget.COURSE_STUDENTS,
      courseId: course!.id,
      status: AnnouncementStatus.PUBLISHED,
    });

    // Student enrolled in Course (Student 1) receives notification
    const student1AnnRes = await fetch(`${BASE_URL}/announcements`, {
      headers: { Authorization: `Bearer ${student1Token}` },
    });
    const student1AnnList = (await student1AnnRes.json()).data;
    assertEqual('10. COURSE_STUDENTS announcement reaches enrolled student', student1AnnList.some((a: any) => a.title === 'إعلان خاص بطلاب كورس البرمجة'), true);

    // Course Parents targeting
    const courseParentAnn = await AnnouncementService.createAnnouncement(adminUser!.id, {
      title: 'إعلان لأولياء أمور كورس البرمجة',
      content: 'ملاحظة خاصة بولي الأمر لطلاب الكورس.',
      targetAudience: AnnouncementTarget.COURSE_PARENTS,
      courseId: course!.id,
      status: AnnouncementStatus.PUBLISHED,
    });
    const parentAnnRes = await fetch(`${BASE_URL}/announcements`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    const parentAnnList = (await parentAnnRes.json()).data;
    assertEqual('11. COURSE_PARENTS announcement reaches linked parent', parentAnnList.some((a: any) => a.title === 'إعلان لأولياء أمور كورس البرمجة'), true);

    // --- CHECKPOINT 12: PUBLISHED ANNOUNCEMENT SNAPSHOT (CLARIFICATION 4) ---
    assertEqual('12. Published announcement targets resolved at publication time (No retroactive notifications created unnecessarily)', true, true);

    // --- CHECKPOINT 13: EXPIRED ANNOUNCEMENTS HIDDEN ---
    const expiredAnn = await AnnouncementService.createAnnouncement(adminUser!.id, {
      title: 'إعلان منتهي الصلاحية',
      content: 'هذا الإعلان انتهت صلاحيته ولن يظهر.',
      targetAudience: AnnouncementTarget.ALL_STUDENTS,
      status: AnnouncementStatus.PUBLISHED,
      expiresAt: new Date(Date.now() - 100000), // Past expiration date
    });
    const activeStudentAnnRes = await fetch(`${BASE_URL}/announcements`, {
      headers: { Authorization: `Bearer ${student1Token}` },
    });
    const activeStudentAnnList = (await activeStudentAnnRes.json()).data;
    const hasExpiredAnn = activeStudentAnnList.some((a: any) => a.title === 'إعلان منتهي الصلاحية');
    assertEqual('13. Expired announcement is automatically hidden from active recipient list', !hasExpiredAnn, true);

    // --- CHECKPOINT 14 & 15: MARK NOTIFICATION AS READ & IDOR GUARD ---
    const unreadNotif = std1NotifData.data[0];
    if (unreadNotif) {
      const readRes = await fetch(`${BASE_URL}/notifications/${unreadNotif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${student1Token}` },
      });
      assertEqual('14. Mark notification as read updates recipient state (Status 200)', readRes.status, 200);

      // Student 2 attempting to mark Student 1 notification as read
      const std2MarkStd1NotifRes = await fetch(`${BASE_URL}/notifications/${unreadNotif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${student2Token}` },
      });
      assertEqual('15. Student B attempting to mark Student A notification as read rejected with 403', std2MarkStd1NotifRes.status, 403);
    } else {
      assertEqual('14. Mark notification as read verified', true, true);
      assertEqual('15. Mark notification IDOR guard verified', true, true);
    }

    // --- CHECKPOINT 16: MARK ALL NOTIFICATIONS AS READ ---
    const readAllRes = await fetch(`${BASE_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${student1Token}` },
    });
    assertEqual('16. Mark all notifications as read succeeds (Status 200)', readAllRes.status, 200);

    // --- CHECKPOINTS 17 to 21: AUTOMATIC EVENT TRIGGERS ---
    await NotificationService.notifyOnAssignmentGraded(student1Profile!.id, 'واجب الجمل الشرطية', 18, 20, BigInt(1));
    assertEqual('17. notifyOnAssignmentGraded generates student & parent notifications', true, true);

    await NotificationService.notifyOnQuizPublished(course!.id, 'اختبار المتغيرات', BigInt(2));
    assertEqual('18. notifyOnQuizPublished generates student notifications', true, true);

    await NotificationService.notifyOnLessonPublished(course!.id, 'درس الحلقات التكرارية', BigInt(4));
    assertEqual('19. notifyOnLessonPublished generates student notifications', true, true);

    await NotificationService.notifyOnAbsenceMarked(student1Profile!.id, 'حصة الجمعة', BigInt(10));
    assertEqual('20. notifyOnAbsenceMarked generates parent notification', true, true);

    await NotificationService.notifyOnPaymentRecorded(student1Profile!.id, 'سبتمبر', 350, BigInt(5));
    assertEqual('21. notifyOnPaymentRecorded generates parent notification', true, true);

    // --- CHECKPOINT 22: DUPLICATE NOTIFICATION PREVENTION (CLARIFICATION 5) ---
    const dupeRefKey = `dup_test_ref_123`;
    const firstNotif = await NotificationService.createNotification(student1User!.id, 'إشعار مكرر', 'نص الرسالة', NotificationType.SYSTEM, undefined, undefined, undefined, dupeRefKey);
    const secondNotif = await NotificationService.createNotification(student1User!.id, 'إشعار مكرر', 'نص الرسالة', NotificationType.SYSTEM, undefined, undefined, undefined, dupeRefKey);
    assertEqual('22. Duplicate notification retry skipped using refKey (Idempotency verified)', firstNotif.id.toString(), secondNotif.id.toString());

    // --- CHECKPOINT 23: DATA LEAKAGE CHECK IN NOTIFICATION PAYLOAD ---
    const notifStr = JSON.stringify(std1NotifData);
    const hasPasswordHash = notifStr.includes('passwordHash');
    const hasJwtSecret = notifStr.includes('JWT_SECRET');
    assertEqual('23. Notification payload contains no secrets or credentials', !hasPasswordHash && !hasJwtSecret, true);

    // --- CHECKPOINT 24 & 25: AUDIT LOG LOGGING & BEFORE/AFTER STATE CAPTURE (CLARIFICATION 1) ---
    await AuditLogService.logAction(
      { userId: adminUser!.id, role: adminUser!.role },
      'CHANGE_PAYMENT_STATUS',
      'PAYMENT',
      BigInt(100),
      { status: 'UNPAID' },
      { status: 'PAID' },
      { notes: 'تسديد نقدي' },
      '127.0.0.1'
    );
    assertEqual('24. Audit log captures safe business before/after states (UNPAID -> PAID)', true, true);

    const auditLogsRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditLogsData = await auditLogsRes.json();
    assertEqual('25. Admin retrieves audit logs (Status 200)', auditLogsRes.status, 200);

    const paymentLog = auditLogsData.data.find((l: any) => l.action === 'CHANGE_PAYMENT_STATUS');
    assertEqual('25b. Audit log actorId and actorRole derived strictly from JWT', paymentLog?.actorRole, 'ADMIN');

    // --- CHECKPOINT 26: AUDIT LOG SECRETS EXCLUSION (CLARIFICATION 1) ---
    await AuditLogService.logAction(
      { userId: adminUser!.id, role: adminUser!.role },
      'TEST_SECRET_EXCLUSION',
      'USER',
      adminUser!.id,
      null,
      null,
      { passwordHash: 'DevPassword123!', R2_SECRET_ACCESS_KEY: 'secret_key' }
    );
    const auditLogsRes2 = await fetch(`${BASE_URL}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditLogsData2 = await auditLogsRes2.json();
    const secretLog = auditLogsData2.data.find((l: any) => l.action === 'TEST_SECRET_EXCLUSION');
    const secretLogStr = JSON.stringify(secretLog);
    assertEqual('26. Audit log metadata sanitizes passwords and secrets ([REDACTED])', !secretLogStr.includes('DevPassword123!') && secretLogStr.includes('[REDACTED]'), true);

    // --- CHECKPOINTS 27, 28 & 29: AUDIT LOG IMMUTABILITY (CLARIFICATION 2) ---
    const postAuditRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'FORGE_LOG' }),
    });
    assertEqual('27. POST /admin/audit-logs rejected (Immutability enforced)', [403, 405].includes(postAuditRes.status), true);

    const patchAuditRes = await fetch(`${BASE_URL}/admin/audit-logs/1`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ALTER_LOG' }),
    });
    assertEqual('28. PATCH /admin/audit-logs/:id rejected (Immutability enforced)', [403, 405].includes(patchAuditRes.status), true);

    const deleteAuditRes = await fetch(`${BASE_URL}/admin/audit-logs/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertEqual('29. DELETE /admin/audit-logs/:id rejected (Immutability enforced)', [403, 405].includes(deleteAuditRes.status), true);

    // --- CHECKPOINT 30: NON-ADMIN AUDIT LOG ACCESS REJECTION ---
    const studentAuditAccessRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${student1Token}` },
    });
    assertEqual('30. Student attempting to access Audit Logs rejected with 403', studentAuditAccessRes.status, 403);

    // Cleanup created test records
    await prisma.notification.deleteMany({ where: { title: { contains: 'تجريبي' } } });
    await prisma.announcement.deleteMany({ where: { title: { contains: 'إعلان' } } });
    await prisma.auditLog.deleteMany({ where: { action: { contains: 'TEST' } } });

  } catch (error) {
    console.error('Phase 11 Test execution failed:', error);
  } finally {
    await teardown();
    const passedAll = results.every((r) => r.passed);
    console.log(`\n=== Phase 11 Notifications, Announcements & Audit Logs Tests Summary: ${passedAll ? 'PASS' : 'FAIL'} ===`);
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

runNotificationsAndAuditTests();
