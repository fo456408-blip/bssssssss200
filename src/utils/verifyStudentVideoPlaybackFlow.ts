if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'mysql://root:123456@localhost:3306/engcode_db';
}
import '../config/env';
import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';

const PORT = 5009;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Playback verification server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Playback verification server stopped');
      resolve();
    });
  });
}

async function verifyStudentVideoPlaybackFlow() {
  await setup();
  let passed = true;

  try {
    console.log('\n========================================');
    console.log('VERIFYING STUDENT VIDEO PLAYBACK FLOW');
    console.log('========================================\n');

    // 1. Authenticate student
    const studentLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
    });
    const studentLogin = await studentLoginRes.json();
    const studentToken = studentLogin.data?.token;

    if (!studentToken) {
      console.error('✖ Student authentication failed');
      passed = false;
      return;
    }
    console.log('[✔ PASS] Student authenticated successfully');

    // Find or create test lesson with video
    let lesson = await prisma.lesson.findFirst({
      where: { videos: { some: {} } },
      include: { videos: true },
    });

    if (!lesson || lesson.videos.length === 0) {
      const course = await prisma.course.findFirst();
      if (!course) throw new Error('No course found');
      lesson = await prisma.lesson.create({
        data: {
          courseId: course.id,
          lessonNumber: 999,
          title: 'Test Playback Lesson',
          isPublished: true,
          videos: {
            create: {
              title: 'Test Video',
              r2StorageKey: `courses/${course.id}/lessons/999/test.mp4`,
              durationSeconds: 300,
            },
          },
        },
        include: { videos: true },
      });
    }

    const lessonId = lesson.id.toString();
    const videoId = lesson.videos[0].id.toString();

    // 2. Fetch Lesson via GET /lessons/:lessonId
    const lessonRes = await fetch(`${BASE_URL}/lessons/${lessonId}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    const lessonData = await lessonRes.json();
    console.log(`GET /lessons/${lessonId} response:`, {
      success: lessonData.success,
      videosCount: lessonData.data?.videos?.length,
    });

    const videos = lessonData.data?.videos || lessonData.data?.lessonVideos || [];
    if (videos.length > 0 && videos[0].id.toString() === videoId) {
      console.log(`[✔ PASS] GET /lessons/${lessonId} returned videos array with video ID ${videoId}`);
    } else {
      console.error(`[✖ FAIL] GET /lessons/${lessonId} did not return expected videos array`);
      passed = false;
    }

    // 3. Call POST /videos/:videoId/access (Exactly as StudentLessonPage does)
    const accessRes = await fetch(`${BASE_URL}/videos/${videoId}/access`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    const accessData = await accessRes.json();

    console.log(`POST /videos/${videoId}/access response:`, accessData);

    const presignedUrl = accessData.data?.presignedUrl;
    if (typeof presignedUrl === 'string' && presignedUrl.length > 0) {
      console.log('[✔ PASS] POST /videos/:id/access returned valid presignedUrl');
    } else {
      console.error('[✖ FAIL] POST /videos/:id/access failed to return presignedUrl');
      passed = false;
    }

    if (presignedUrl && !presignedUrl.includes('x-id=PutObject')) {
      console.log('[✔ PASS] Presigned URL is for GET / playback and does NOT contain x-id=PutObject');
    } else {
      console.error('[✖ FAIL] Presigned URL contains x-id=PutObject!');
      passed = false;
    }

    console.log('\n========================================');
    console.log(`VERIFICATION RESULT: ${passed ? 'ALL PASSED' : 'FAILED'}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Verification error:', error);
    passed = false;
  } finally {
    await teardown();
    if (!passed) process.exit(1);
  }
}

verifyStudentVideoPlaybackFlow();
