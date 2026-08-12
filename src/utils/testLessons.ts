import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';

const PORT = 5004;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Lessons & Videos Test server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Lessons & Videos Test server stopped');
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

async function runLessonTests() {
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

    // 2. Authenticate Student (ahmed_student - enrolled in Programming course)
    const studentLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
      })
    ).json();
    const studentToken = studentLogin.data.token;
    const studentProfileId = studentLogin.data.user.profile.id.toString();

    // 3. Authenticate Teacher (ahmed_teacher)
    const teacherLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ahmed_teacher', password: 'DevPassword123!' }),
      })
    ).json();
    const teacherToken = teacherLogin.data.token;

    // 4. Authenticate Parent (mohamed_parent)
    const parentLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'mohamed_parent', password: 'DevPassword123!' }),
      })
    ).json();
    const parentToken = parentLogin.data.token;

    // Get seed course
    const seedCourse = await prisma.course.findFirst();
    if (!seedCourse) throw new Error('Seed course missing');

    // --- SCENARIO 1: Admin Create Published Lesson ---
    const createLessonRes = await fetch(`${BASE_URL}/admin/lessons`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: seedCourse.id.toString(),
        lessonNumber: 99,
        title: 'درس البرمجة المتقدمة 99',
        description: 'وصف الدرس التجريبي 99',
        isPublished: true,
      }),
    });
    const createdLessonData = await createLessonRes.json();
    assertEqual('1. Admin create lesson (Status 201)', createLessonRes.status, 201);
    const lessonId = createdLessonData.data.id;

    // --- SCENARIO 2: Admin Request R2 Upload Presigned URL ---
    const uploadUrlRes = await fetch(`${BASE_URL}/admin/lessons/${lessonId}/videos/upload-url`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'intro_video.mp4',
        contentType: 'video/mp4',
      }),
    });
    const uploadUrlData = await uploadUrlRes.json();
    assertEqual('2. Admin request R2 upload presigned URL (Status 200)', uploadUrlRes.status, 200);
    assertEqual('3. Presigned upload URL returned', typeof uploadUrlData.data.uploadUrl, 'string');
    assertEqual('4. R2 Secret Credentials NOT exposed in response', uploadUrlData.data.secretAccessKey, undefined);

    const storageKey = uploadUrlData.data.storageKey;

    // --- SCENARIO 3: Admin Complete Video Metadata Registration ---
    const completeVideoRes = await fetch(`${BASE_URL}/admin/lessons/${lessonId}/videos/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storageKey: storageKey,
        title: 'فيديو مقدمة البرمجة',
        durationSeconds: 1200,
        fileSizeBytes: 524288000, // 500 MB
        isPublished: true,
      }),
    });
    const completedVideoData = await completeVideoRes.json();
    assertEqual('5. Admin complete video upload metadata (Status 201)', completeVideoRes.status, 201);
    const videoId = completedVideoData.data.id;

    // --- SCENARIO 4: Arbitrary Storage Key Rejection ---
    const invalidStorageKeyRes = await fetch(`${BASE_URL}/admin/lessons/${lessonId}/videos/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storageKey: 'arbitrary/unsafe/key.mp4',
        title: 'فيديو غير مصرح',
      }),
    });
    assertEqual('6. Arbitrary storage key rejected with 400', invalidStorageKeyRes.status, 400);

    // --- SCENARIO 5: Student Video Presigned GET Access ---
    const videoAccessRes = await fetch(`${BASE_URL}/videos/${videoId}/access`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    const videoAccessData = await videoAccessRes.json();
    assertEqual('7. Enrolled Student video access request (Status 200)', videoAccessRes.status, 200);
    assertEqual('8. Presigned download view URL returned', typeof videoAccessData.data.presignedUrl, 'string');

    // --- SCENARIO 6: Student Access to Unpublished Lesson Rejected ---
    const createDraftLessonRes = await fetch(`${BASE_URL}/admin/lessons`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: seedCourse.id.toString(),
        lessonNumber: 100,
        title: 'درس مسودة 100',
        isPublished: false, // Draft!
      }),
    });
    const draftLessonData = await createDraftLessonRes.json();

    const getDraftLessonRes = await fetch(`${BASE_URL}/lessons/${draftLessonData.data.id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    assertEqual('9. Student accessing draft/unpublished lesson rejected with 403', getDraftLessonRes.status, 403);

    // --- SCENARIO 7: Student Video Progress Tracking & Auto-completion ---
    const updateProgressRes = await fetch(`${BASE_URL}/student/lessons/${lessonId}/progress`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lastPosition: 1100, // 18:20 mins
        completionPercentage: 92.5, // >= 90% triggers isCompleted = true
      }),
    });
    const progressData = await updateProgressRes.json();
    assertEqual('10. Student update video progress (Status 200)', updateProgressRes.status, 200);
    assertEqual('11. Progress >= 90% automatically marks isCompleted = true', progressData.data.isCompleted, true);

    // --- SCENARIO 8: Student Progress Privacy Isolation ---
    const omarStudent = await prisma.student.findFirst({
      where: { id: { not: BigInt(studentProfileId) } },
    });
    if (omarStudent) {
      const getOtherProgressRes = await fetch(`${BASE_URL}/student/students/${omarStudent.id.toString()}/lessons/${lessonId}/progress`, {
        headers: { 'Authorization': `Bearer ${studentToken}` },
      });
      assertEqual('12. Student accessing another student progress rejected with 403', getOtherProgressRes.status, 403);
    }

    // --- SCENARIO 9: Parent Cannot Request Video Presigned URLs ---
    const parentVideoAccessRes = await fetch(`${BASE_URL}/videos/${videoId}/access`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
    });
    assertEqual('13. Parent requesting video access rejected with 403', parentVideoAccessRes.status, 403);

    // --- SCENARIO 10: Unauthenticated Request Rejection ---
    const unauthRes = await fetch(`${BASE_URL}/admin/lessons`, { method: 'POST' });
    assertEqual('14. Unauthenticated lesson request rejected with 401', unauthRes.status, 401);

    // Cleanup created test records
    await prisma.studentLessonProgress.deleteMany({ where: { lessonId: BigInt(lessonId) } });
    await prisma.lessonVideo.delete({ where: { id: BigInt(videoId) } });
    await prisma.lesson.delete({ where: { id: BigInt(lessonId) } });
    await prisma.lesson.delete({ where: { id: BigInt(draftLessonData.data.id) } });

  } catch (error) {
    console.error('Lessons Test execution failed:', error);
  } finally {
    await teardown();
    const passedAll = results.every((r) => r.passed);
    console.log(`\n=== Lessons & Cloudflare R2 Integration Tests Summary: ${passedAll ? 'PASS' : 'FAIL'} ===`);
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

runLessonTests();
