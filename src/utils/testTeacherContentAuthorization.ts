import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';
import { JwtUtils } from './jwt';

const PORT = 5030;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;
let passCount = 0;
let failCount = 0;

function recordTest(title: string, success: boolean, detail: string) {
  if (success) {
    passCount++;
    console.log(`[✔ PASS] ${title}: ${detail}`);
  } else {
    failCount++;
    console.error(`[✖ FAIL] ${title}: ${detail}`);
  }
}

async function setupServer(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Teacher Content Authorization Test Server started on port ${PORT}`);
      resolve();
    });
  });
}

async function runTests() {
  await setupServer();
  console.log('\n========================================');
  console.log('STARTING TEACHER CONTENT AUTHORIZATION COMPREHENSIVE E2E AUDIT');
  console.log('========================================\n');

  try {
    // 1. Setup Admin, Teacher A (Assigned), Teacher B (Unassigned)
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      recordTest('Setup', false, 'No Admin user found');
      return;
    }
    const adminToken = JwtUtils.signToken({
      userId: adminUser.id.toString(),
      username: adminUser.username,
      role: 'ADMIN',
    });

    // Create Course for Testing
    const academicYear = await prisma.academicYear.findFirst();
    const course = await prisma.course.create({
      data: {
        academicYearId: academicYear!.id,
        code: `AUTH_CRS_${Date.now()}`,
        name: `كورس اختبار الصلاحيات_${Math.floor(Math.random() * 900 + 100)}`,
        grade: 'FIRST_SECONDARY',
        defaultMonthlyFee: 350,
      },
    });

    // Create Teacher A & Assign Course
    const userA = await prisma.user.create({
      data: { username: `prof_a_${Date.now()}`, passwordHash: 'hash', fullName: 'المعلم أ (مخول)', role: 'TEACHER' },
    });
    const teacherA = await prisma.teacher.create({ data: { userId: userA.id, specialization: 'برمجة' } });
    await prisma.teacherCourse.create({ data: { teacherId: teacherA.id, courseId: course.id } });

    // Create Teacher B (Unassigned)
    const userB = await prisma.user.create({
      data: { username: `prof_b_${Date.now()}`, passwordHash: 'hash', fullName: 'المعلم ب (غير مخول)', role: 'TEACHER' },
    });
    const teacherB = await prisma.teacher.create({ data: { userId: userB.id, specialization: 'لغات' } });

    const tokenA = JwtUtils.signToken({ userId: userA.id.toString(), username: userA.username, role: 'TEACHER' });
    const tokenB = JwtUtils.signToken({ userId: userB.id.toString(), username: userB.username, role: 'TEACHER' });

    console.log(`Course Created ID=${course.id}`);
    console.log(`Teacher A ID=${teacherA.id} (Assigned to Course ${course.id})`);
    console.log(`Teacher B ID=${teacherB.id} (Not Assigned)\n`);

    // ----------------------------------------------------
    // TEST SECTION 1: LESSON MANAGEMENT BY ASSIGNED TEACHER
    // ----------------------------------------------------
    console.log('--- 1. Lesson Management by Assigned Teacher A ---');
    const createLessonRes = await fetch(`${BASE_URL}/admin/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: course.id.toString(),
        lessonNumber: 1,
        title: 'الدرس الأول: مقدمة في الخوارزميات',
        description: 'شرح المفاهيم الأساسية',
        isPublished: true,
      }),
    });
    const lessonData = await createLessonRes.json();
    console.log('Create Lesson Response:', createLessonRes.status, lessonData);
    const lessonId = lessonData.data?.id;
    recordTest('Teacher A Create Lesson in Assigned Course', createLessonRes.status === 201 && Boolean(lessonId), `Status=${createLessonRes.status}`);

    const editLessonRes = await fetch(`${BASE_URL}/admin/lessons/${lessonId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'الدرس الأول: خوارزميات البحث المتقدمة' }),
    });
    recordTest('Teacher A Edit Lesson in Assigned Course', editLessonRes.status === 200, `Status=${editLessonRes.status}`);

    // Video Upload Test
    const videoUploadRes = await fetch(`${BASE_URL}/admin/lessons/${lessonId}/videos/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'lesson1.mp4', contentType: 'video/mp4' }),
    });
    recordTest('Teacher A Video Upload Request', videoUploadRes.status === 200, `Status=${videoUploadRes.status}`);

    // ----------------------------------------------------
    // TEST SECTION 2: ASSIGNMENT MANAGEMENT BY ASSIGNED TEACHER
    // ----------------------------------------------------
    console.log('\n--- 2. Assignment Management by Assigned Teacher A ---');
    const createAssignRes = await fetch(`${BASE_URL}/admin/assignments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId: lessonId.toString(),
        title: 'واجب الخوارزميات الأول',
        description: 'حل كافة المسائل الأسبوعية',
        maxScore: 100,
        isPublished: true,
      }),
    });
    const assignData = await createAssignRes.json();
    const assignId = assignData.data?.id;
    recordTest('Teacher A Create Assignment in Assigned Course', createAssignRes.status === 201 && Boolean(assignId), `Status=${createAssignRes.status}`);

    const editAssignRes = await fetch(`${BASE_URL}/admin/assignments/${assignId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'واجب الخوارزميات المعدل' }),
    });
    recordTest('Teacher A Edit Assignment in Assigned Course', editAssignRes.status === 200, `Status=${editAssignRes.status}`);

    // ----------------------------------------------------
    // TEST SECTION 3: QUIZ & QUESTION MANAGEMENT BY ASSIGNED TEACHER
    // ----------------------------------------------------
    console.log('\n--- 3. Quiz & Question Management by Assigned Teacher A ---');
    const createQuizRes = await fetch(`${BASE_URL}/admin/quizzes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId: lessonId.toString(),
        title: 'اختبار الخوارزميات السريع',
        durationMinutes: 20,
        passingScore: 50,
        maxAttempts: 2,
        isPublished: true,
      }),
    });
    const quizData = await createQuizRes.json();
    const quizId = quizData.data?.id;
    recordTest('Teacher A Create Quiz in Assigned Course', createQuizRes.status === 201 && Boolean(quizId), `Status=${createQuizRes.status}`);

    // Add Question
    const addQuestionRes = await fetch(`${BASE_URL}/admin/quiz-questions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: quizId.toString(),
        questionText: 'ما هي التعقيدية الزمنية لترتيب الخوارزمية؟',
        type: 'MCQ',
        points: 2.5,
        options: [
          { optionText: 'O(N)', isCorrect: false },
          { optionText: 'O(N log N)', isCorrect: true },
        ],
      }),
    });
    const questionData = await addQuestionRes.json();
    const questionId = questionData.data?.id;
    recordTest('Teacher A Add Quiz Question with Decimal Score (2.5)', addQuestionRes.status === 201 && Boolean(questionId), `Status=${addQuestionRes.status}`);

    // Edit Question
    const editQuestionRes = await fetch(`${BASE_URL}/admin/quiz-questions/${questionId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionText: 'السؤال المعدل: خوارزمية الترتيب؟', points: 3.5 }),
    });
    recordTest('Teacher A Edit Quiz Question (3.5 points)', editQuestionRes.status === 200, `Status=${editQuestionRes.status}`);

    // ----------------------------------------------------
    // TEST SECTION 4: ANNOUNCEMENTS & GROUPS BY ASSIGNED TEACHER
    // ----------------------------------------------------
    console.log('\n--- 4. Announcements & Groups by Assigned Teacher A ---');
    const createAnnRes = await fetch(`${BASE_URL}/admin/announcements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'تنبيه هرب الكورس',
        content: 'يرجى مراجعة الدرس الأول قبل المحاضرة القادمة',
        targetAudience: 'COURSE_STUDENTS',
        courseId: course.id.toString(),
        status: 'PUBLISHED',
      }),
    });
    recordTest('Teacher A Create Announcement for Assigned Course', createAnnRes.status === 201, `Status=${createAnnRes.status}`);

    // Create Group
    const createGroupRes = await fetch(`${BASE_URL}/teacher/groups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: course.id.toString(),
        name: 'مجموعة السبت السابعة مساءً',
        maxCapacity: 25,
      }),
    });
    const groupData = await createGroupRes.json();
    const groupId = groupData.data?.id;
    recordTest('Teacher A Create Group in Assigned Course', createGroupRes.status === 201 && Boolean(groupId), `Status=${createGroupRes.status}`);

    // Create Session under Group
    const createSessionRes = await fetch(`${BASE_URL}/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: groupId.toString(),
        lessonId: lessonId.toString(),
        sessionDate: new Date().toISOString(),
        topic: 'حصة التقييم الأول',
      }),
    });
    const sessionData = await createSessionRes.json();
    const sessionId = sessionData.data?.id;
    recordTest('Teacher A Create Session in Assigned Group', createSessionRes.status === 201 && Boolean(sessionId), `Status=${createSessionRes.status}`);

    // Attendance Sheet
    const attendanceRes = await fetch(`${BASE_URL}/sessions/${sessionId}/attendance`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    recordTest('Teacher A View Attendance Sheet', attendanceRes.status === 200, `Status=${attendanceRes.status}`);

    // ----------------------------------------------------
    // TEST SECTION 5: SECURITY BOUNDARY (UNASSIGNED TEACHER B REJECTED 403)
    // ----------------------------------------------------
    console.log('\n--- 5. Security Boundary: Unassigned Teacher B Access Blocked ---');

    const bLessRes = await fetch(`${BASE_URL}/admin/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id.toString(), lessonNumber: 99, title: 'اختراق دروس' }),
    });
    recordTest('Teacher B Create Lesson Blocked (403)', bLessRes.status === 403, `Status=${bLessRes.status}`);

    const bAssignRes = await fetch(`${BASE_URL}/admin/assignments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId: lessonId.toString(), title: 'اختراق واجبات', maxScore: 100 }),
    });
    recordTest('Teacher B Create Assignment Blocked (403)', bAssignRes.status === 403, `Status=${bAssignRes.status}`);

    const bQuizRes = await fetch(`${BASE_URL}/admin/quizzes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId: lessonId.toString(), title: 'اختراق اختبارات', durationMinutes: 10 }),
    });
    recordTest('Teacher B Create Quiz Blocked (403)', bQuizRes.status === 403, `Status=${bQuizRes.status}`);

    const bGroupRes = await fetch(`${BASE_URL}/teacher/groups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id.toString(), name: 'اختراق مجموعات' }),
    });
    recordTest('Teacher B Create Group Blocked (403)', bGroupRes.status === 403, `Status=${bGroupRes.status}`);

    // ----------------------------------------------------
    // TEST SECTION 6: TEACHER CANNOT MODIFY ACADEMIC STRUCTURE
    // ----------------------------------------------------
    console.log('\n--- 6. Teacher Blocked from Academic Structure Mutations ---');
    const teacherCreateCourseRes = await fetch(`${BASE_URL}/admin/courses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ academicYearId: academicYear!.id.toString(), code: 'HACK_CRS', name: 'كورس غير مسموح' }),
    });
    recordTest('Teacher Create Course Blocked (403)', teacherCreateCourseRes.status === 403, `Status=${teacherCreateCourseRes.status}`);

    const teacherEditCourseRes = await fetch(`${BASE_URL}/admin/courses/${course.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'تغيير كورس غير مسموح' }),
    });
    recordTest('Teacher Edit Course Blocked (403)', teacherEditCourseRes.status === 403, `Status=${teacherEditCourseRes.status}`);

    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    if (sessionId) await prisma.attendance.deleteMany({ where: { sessionId: BigInt(sessionId) } });
    if (groupId) {
      await prisma.classSession.deleteMany({ where: { groupId: BigInt(groupId) } });
      await prisma.groupStudent.deleteMany({ where: { groupId: BigInt(groupId) } });
    }
    await prisma.group.deleteMany({ where: { courseId: course.id } });
    await prisma.announcement.deleteMany({ where: { courseId: course.id } });
    if (questionId) await prisma.quizOption.deleteMany({ where: { questionId: BigInt(questionId) } });
    if (quizId) await prisma.quizQuestion.deleteMany({ where: { quizId: BigInt(quizId) } });
    if (lessonId) {
      await prisma.quiz.deleteMany({ where: { lessonId: BigInt(lessonId) } });
      await prisma.assignment.deleteMany({ where: { lessonId: BigInt(lessonId) } });
    }
    await prisma.lesson.deleteMany({ where: { courseId: course.id } });
    await prisma.teacherCourse.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.teacher.deleteMany({ where: { id: { in: [teacherA.id, teacherB.id] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    recordTest('Cleanup', true, 'Test records cleaned up successfully');

    recordTest('Cleanup', true, 'Test records cleaned up successfully');
  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
    await prisma.$disconnect();

    console.log('\n========================================');
    console.log(`TEACHER CONTENT AUTHORIZATION E2E AUDIT COMPLETED: PASS = ${passCount}, FAIL = ${failCount}`);
    console.log('========================================\n');
  }
}

runTests();
