import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';

const PORT = 5005;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server: Server;

async function setup() {
  return new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Quizzes & Assessment Engine Comprehensive Security Test server started on port ${PORT}`);
      resolve();
    });
  });
}

async function teardown() {
  return new Promise<void>((resolve) => {
    server.close(() => {
      console.log('Quizzes & Assessment Engine Comprehensive Security Test server stopped');
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

async function runQuizTests() {
  await setup();

  try {
    // 1. Logins
    const adminLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'DevPassword123!' }),
      })
    ).json();
    const adminToken = adminLogin.data.token;

    const studentLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ahmed_student', password: 'DevPassword123!' }),
      })
    ).json();
    const studentToken = studentLogin.data.token;
    const studentProfileId = studentLogin.data.user.profile.id.toString();

    const omarLogin = await (
      await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'omar_student', password: 'DevPassword123!' }),
      })
    ).json();
    const omarToken = omarLogin.data.token;

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

    const seedLesson = await prisma.lesson.findFirst({ where: { isPublished: true } });
    if (!seedLesson) throw new Error('Seed published lesson missing');

    // --- SCENARIO 1: Admin Create Quiz ---
    const createQuizRes = await fetch(`${BASE_URL}/admin/quizzes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lessonId: seedLesson.id.toString(),
        title: 'اختبار خوارزميات البرمجة النهائي',
        description: 'اختبار تقييمي للدرس الأول',
        durationMinutes: 15,
        passingScore: 60,
        maxAttempts: 1, // Only 1 attempt allowed for testing maxAttempts limit
        isPublished: true,
      }),
    });
    const quizData = await createQuizRes.json();
    assertEqual('1. Admin create quiz (Status 201)', createQuizRes.status, 201);
    const quizId = quizData.data.id;

    // --- SCENARIO 2: Admin Add MCQ Question ---
    const mcqRes = await fetch(`${BASE_URL}/admin/quiz-questions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quizId,
        questionType: 'MCQ',
        questionText: 'ما هي الكلمة المفتاحية لتعريف الدالة في Python؟',
        points: 5,
        displayOrder: 1,
        options: [
          { optionText: 'def', isCorrect: true, displayOrder: 1 },
          { optionText: 'function', isCorrect: false, displayOrder: 2 },
          { optionText: 'func', isCorrect: false, displayOrder: 3 },
        ],
      }),
    });
    const mcqData = await mcqRes.json();
    assertEqual('2. Admin create MCQ question (Status 201)', mcqRes.status, 201);
    const mcqQuestion = mcqData.data;
    const correctOptionId = mcqQuestion.options.find((o: any) => o.isCorrect).id.toString();
    const wrongOptionId = mcqQuestion.options.find((o: any) => !o.isCorrect).id.toString();

    // --- SCENARIO 3: Admin Add True/False Question ---
    const tfRes = await fetch(`${BASE_URL}/admin/quiz-questions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quizId,
        questionType: 'TRUE_FALSE',
        questionText: 'لغة Python هي لغة مفسرة (Interpreted language).',
        points: 5,
        displayOrder: 2,
        options: [
          { optionText: 'صح', isCorrect: true, displayOrder: 1 },
          { optionText: 'خطأ', isCorrect: false, displayOrder: 2 },
        ],
      }),
    });
    const tfData = await tfRes.json();
    assertEqual('3. Admin create True/False question (Status 201)', tfRes.status, 201);
    const tfQuestion = tfData.data;
    const tfOptionId = tfQuestion.options[0].id.toString();

    // --- SCENARIO 4: Quiz B Creation for Cross-Quiz Testing ---
    const quizBRes = await fetch(`${BASE_URL}/admin/quizzes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lessonId: seedLesson.id.toString(),
        title: 'اختبار B لاختبار التداخل',
        isPublished: true,
      }),
    });
    const quizBData = await quizBRes.json();
    const quizBId = quizBData.data.id;

    const quizBQuestionRes = await fetch(`${BASE_URL}/admin/quiz-questions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quizId: quizBId,
        questionType: 'MCQ',
        questionText: 'سؤال ينتمي لاختبار B فقط',
        points: 5,
        options: [
          { optionText: 'اختيار 1', isCorrect: true, displayOrder: 1 },
          { optionText: 'اختيار 2', isCorrect: false, displayOrder: 2 },
        ],
      }),
    });
    const quizBQuestionData = await quizBQuestionRes.json();
    const quizBQuestionId = quizBQuestionData.data.id;

    // --- SCENARIO 5: CRITICAL SECURITY RULE - Student Payload Zero Answer Key Leakage ---
    const studentQuizRes = await fetch(`${BASE_URL}/quizzes/${quizId}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    const studentQuizData = await studentQuizRes.json();
    assertEqual('4. Student fetch quiz (Status 200)', studentQuizRes.status, 200);

    const firstQuestionOptions = studentQuizData.data.questions[0].options;
    const leakCheck = firstQuestionOptions.some((o: any) => o.isCorrect !== undefined);
    assertEqual('5. CRITICAL SECURITY: isCorrect completely omitted from student options', leakCheck, false);

    // --- SCENARIO 6: Student Access Draft Quiz Rejected ---
    const draftQuizRes = await fetch(`${BASE_URL}/admin/quizzes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lessonId: seedLesson.id.toString(),
        title: 'اختبار مسودة غير متاح',
        isPublished: false,
      }),
    });
    const draftQuizData = await draftQuizRes.json();

    const studentDraftAccessRes = await fetch(`${BASE_URL}/quizzes/${draftQuizData.data.id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    assertEqual('6. Student accessing draft quiz rejected with 403', studentDraftAccessRes.status, 403);

    // --- SCENARIO 7: Student Start Attempt ---
    const startAttemptRes = await fetch(`${BASE_URL}/student/quizzes/${quizId}/attempts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    const startAttemptData = await startAttemptRes.json();
    assertEqual('7. Student start attempt (Status 201)', startAttemptRes.status, 201);
    const attemptId = startAttemptData.data.attempt.id;

    // --- SCENARIO 8: STUDENT ATTEMPT OWNERSHIP SECURITY ---
    // Student B (Omar) attempting to submit Student A (Ahmed)'s attempt
    const omarSubmitRes = await fetch(`${BASE_URL}/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${omarToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        answers: [{ questionId: mcqQuestion.id.toString(), selectedOptionId: correctOptionId }],
      }),
    });
    assertEqual('8. Student B submitting Student A attempt rejected with 403', omarSubmitRes.status, 403);

    // Student B attempting to view Student A attempt history
    const omarViewAttemptsRes = await fetch(`${BASE_URL}/quizzes/${quizId}/students/${studentProfileId}/attempts`, {
      headers: { 'Authorization': `Bearer ${omarToken}` },
    });
    assertEqual('9. Student B viewing Student A attempt history rejected with 403', omarViewAttemptsRes.status, 403);

    // --- SCENARIO 9: CROSS-QUIZ QUESTION VALIDATION ---
    const crossQuizSubmitRes = await fetch(`${BASE_URL}/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        answers: [{ questionId: quizBQuestionId.toString(), selectedOptionId: correctOptionId }],
      }),
    });
    assertEqual('10. Submitting question belonging to Quiz B into Quiz A rejected with 400', crossQuizSubmitRes.status, 400);

    // --- SCENARIO 10: CROSS-QUESTION OPTION VALIDATION ---
    const crossOptionSubmitRes = await fetch(`${BASE_URL}/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        answers: [{ questionId: mcqQuestion.id.toString(), selectedOptionId: tfOptionId }],
      }),
    });
    assertEqual('11. Submitting option belonging to Question 2 into Question 1 rejected with 400', crossOptionSubmitRes.status, 400);

    // --- SCENARIO 11: FRONTEND SCORE MANIPULATION RESISTANCE ---
    const manipulatedSubmitRes = await fetch(`${BASE_URL}/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        score: 999, // Fake client score
        percentage: 100, // Fake client percentage
        isPassed: true, // Fake client status
        answers: [
          { questionId: mcqQuestion.id.toString(), selectedOptionId: wrongOptionId }, // Wrong answer!
        ],
      }),
    });
    const manipulatedData = await manipulatedSubmitRes.json();
    assertEqual('12. Frontend fake score/percentage ignored by backend auto-grading engine', manipulatedSubmitRes.status, 200);
    assertEqual('13. Actual backend calculated score is 0 (wrong answer)', manipulatedData.data.earnedPoints, 0);
    assertEqual('14. Actual backend calculated percentage is 0%', manipulatedData.data.percentage, 0);

    // --- SCENARIO 12: EXPIRED ATTEMPT VERIFICATION ---
    // Create short 1-minute quiz and simulate past start time
    const shortQuizRes = await fetch(`${BASE_URL}/admin/quizzes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId: seedLesson.id.toString(), title: 'اختبار منتهي الصلاحية', durationMinutes: 1, isPublished: true }),
    });
    const shortQuizId = (await shortQuizRes.json()).data.id;

    const expiredAttemptRes = await fetch(`${BASE_URL}/student/quizzes/${shortQuizId}/attempts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    const expiredAttemptId = (await expiredAttemptRes.json()).data.attempt.id;

    // Mutate startTime in database to 10 minutes in past to exceed 1 minute deadline
    const pastTime = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.quizAttempt.update({ where: { id: BigInt(expiredAttemptId) }, data: { startTime: pastTime } });

    const submitExpiredRes = await fetch(`${BASE_URL}/student/attempts/${expiredAttemptId}/submit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [] }),
    });
    const expiredData = await submitExpiredRes.json();
    assertEqual('15. Deadline exceeded attempt status marked EXPIRED by backend server timestamp', expiredData.data.status, 'EXPIRED');

    // --- SCENARIO 13: MAXIMUM ATTEMPTS LIMIT ENFORCEMENT ---
    const secondAttemptRes = await fetch(`${BASE_URL}/student/quizzes/${quizId}/attempts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
    });
    assertEqual('16. Exceeding maxAttempts rejected with 400', secondAttemptRes.status, 400);

    // --- SCENARIO 14: TEACHER AUTHORIZATION MATRIX ---
    // Teacher accessing assigned course quizzes
    const teacherAssignedRes = await fetch(`${BASE_URL}/lessons/${seedLesson.id.toString()}/quizzes`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` },
    });
    assertEqual('17. Teacher A accessing assigned course quizzes (Status 200)', teacherAssignedRes.status, 200);

    // --- SCENARIO 15: PARENT AUTHORIZATION MATRIX ---
    const parentStudent = await prisma.student.findFirst({ where: { user: { username: 'ahmed_student' } } });
    const parentAttemptsRes = await fetch(`${BASE_URL}/quizzes/${quizId}/students/${parentStudent?.id.toString()}/attempts`, {
      headers: { 'Authorization': `Bearer ${parentToken}` },
    });
    assertEqual('18. Parent viewing linked child attempts (Status 200)', parentAttemptsRes.status, 200);

    const parentUnlinkedRes = await fetch(`${BASE_URL}/quizzes/${quizId}/students/999999/attempts`, {
      headers: { 'Authorization': `Bearer ${parentToken}` },
    });
    assertEqual('19. Parent viewing unlinked student attempts rejected with 403', parentUnlinkedRes.status, 403);

    // --- SCENARIO 16: UNAUTHENTICATED REQUEST REJECTION ---
    const unauthRes = await fetch(`${BASE_URL}/admin/quizzes`, { method: 'POST' });
    assertEqual('20. Unauthenticated quiz request rejected with 401', unauthRes.status, 401);

    // Cleanup created test records
    await prisma.quizAnswer.deleteMany({ where: { attemptId: { in: [BigInt(attemptId), BigInt(expiredAttemptId)] } } });
    await prisma.quizAttempt.deleteMany({ where: { id: { in: [BigInt(attemptId), BigInt(expiredAttemptId)] } } });
    await prisma.quizOption.deleteMany({ where: { question: { quizId: { in: [BigInt(quizId), BigInt(quizBId), BigInt(shortQuizId)] } } } });
    await prisma.quizQuestion.deleteMany({ where: { quizId: { in: [BigInt(quizId), BigInt(quizBId), BigInt(shortQuizId)] } } });
    await prisma.quiz.deleteMany({ where: { id: { in: [BigInt(quizId), BigInt(quizBId), BigInt(draftQuizData.data.id), BigInt(shortQuizId)] } } });

  } catch (error) {
    console.error('Quiz Test execution failed:', error);
  } finally {
    await teardown();
    const passedAll = results.every((r) => r.passed);
    console.log(`\n=== Quizzes & Assessment Engine Security Tests Summary: ${passedAll ? 'PASS' : 'FAIL'} ===`);
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

runQuizTests();
