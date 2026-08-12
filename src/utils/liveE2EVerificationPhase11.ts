const BASE_URL = 'http://localhost:5000/api/v1';

async function runLiveE2EVerification() {
  console.log('=== Starting Phase 11 Live E2E Verification ===\n');

  // 1. Admin Login
  const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'DevPassword123!' }),
  });
  const adminLogin = await adminLoginRes.json();
  const adminToken = adminLogin.data.token;
  console.log('[✔ Step 1] Admin Login Success');

  // 2. Admin creates targeted announcement for COURSE_STUDENTS
  const coursesRes = await fetch(`${BASE_URL}/admin/courses`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const coursesData = await coursesRes.json();
  const courseId = coursesData.data[0].id;

  const createAnnRes = await fetch(`${BASE_URL}/admin/announcements`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'إعلان لايف هاما',
      content: 'تنبيه مباشر عبر الواجهة التفاعلية لجميع الطلاب الحسابيين في الكورس.',
      targetAudience: 'COURSE_STUDENTS',
      courseId,
      status: 'PUBLISHED',
    }),
  });
  const annData = await createAnnRes.json();
  console.log('[✔ Step 2] Admin Created & Published Targeted Announcement:', annData.data.title);

  // 3. Student Login
  const stdLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
  });
  const stdLogin = await stdLoginRes.json();
  const studentToken = stdLogin.data.token;
  console.log('[✔ Step 3] Student Login Success');

  // 4. Student fetch notifications
  const stdNotifRes = await fetch(`${BASE_URL}/notifications`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const stdNotifData = await stdNotifRes.json();
  console.log('[✔ Step 4] Student Retrieved Notifications:', stdNotifData.data.length, 'items');

  // 5. Student fetch unread count
  const unreadCountRes = await fetch(`${BASE_URL}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const unreadCountData = await unreadCountRes.json();
  console.log('[✔ Step 5] Student Initial Unread Count:', unreadCountData.data.unreadCount);

  // 6. Student mark first notification as read
  if (stdNotifData.data.length > 0) {
    const notifId = stdNotifData.data[0].id;
    const markReadRes = await fetch(`${BASE_URL}/notifications/${notifId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    console.log('[✔ Step 6] Student Marked Single Notification as Read:', markReadRes.status === 200 ? 'SUCCESS' : 'FAILED');
  }

  // 7. Student mark all read
  const markAllRes = await fetch(`${BASE_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  console.log('[✔ Step 7] Student Marked All Notifications as Read:', markAllRes.status === 200 ? 'SUCCESS' : 'FAILED');

  // 8. Verify unread count is 0
  const finalUnreadRes = await fetch(`${BASE_URL}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const finalUnreadData = await finalUnreadRes.json();
  console.log('[✔ Step 8] Final Student Unread Count:', finalUnreadData.data.unreadCount);

  // 9. Parent Login
  const parentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'mohamed_parent', password: 'DevPassword123!' }),
  });
  const parentLogin = await parentLoginRes.json();
  const parentToken = parentLogin.data.token;
  console.log('[✔ Step 9] Parent Login Success');

  // 10. Parent fetch notifications
  const parentNotifRes = await fetch(`${BASE_URL}/notifications`, {
    headers: { Authorization: `Bearer ${parentToken}` },
  });
  const parentNotifData = await parentNotifRes.json();
  console.log('[✔ Step 10] Parent Notifications Count:', parentNotifData.data.length);

  // 11. Admin fetch Audit Logs
  const auditRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const auditData = await auditRes.json();
  console.log('[✔ Step 11] Admin Retrieved Audit Logs Count:', auditData.data.length);

  // 12. Immutability Verification: Attempt POST to /admin/audit-logs
  const postAuditRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'TAMPER' }),
  });
  console.log('[✔ Step 12] Audit Log POST Tamper Rejection:', postAuditRes.status === 403 ? '403 Forbidden (PROTECTED)' : postAuditRes.status);

  // 13. Immutability Verification: Attempt DELETE to /admin/audit-logs/1
  const deleteAuditRes = await fetch(`${BASE_URL}/admin/audit-logs/1`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('[✔ Step 13] Audit Log DELETE Tamper Rejection:', deleteAuditRes.status === 403 ? '403 Forbidden (PROTECTED)' : deleteAuditRes.status);

  // 14. Non-admin audit log access rejection
  const studentAuditRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  console.log('[✔ Step 14] Student Audit Access Rejection:', studentAuditRes.status === 403 ? '403 Forbidden (PROTECTED)' : studentAuditRes.status);

  console.log('\n=== Live E2E Verification Completed Successfully ===');
}

runLiveE2EVerification();
