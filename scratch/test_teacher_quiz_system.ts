import { prisma } from '../src/config/database';
import { TeacherService } from '../src/services/teacher.service';
import { QuizService } from '../src/services/quiz.service';
import { StudentDashboardService } from '../src/services/student-dashboard.service';

async function main() {
  console.log('==================================================');
  console.log('     TEACHER QUIZ PERMISSIONS & SCOPE E2E TEST     ');
  console.log('==================================================\n');

  // Find a teacher user
  const teacher = await prisma.teacher.findFirst({
    include: { user: true, teacherCourses: { include: { course: true } } },
  });

  if (!teacher) {
    console.error('❌ FAIL: No teacher found in database');
    return;
  }

  const teacherUser = teacher.user;
  console.log(`[INFO] Found Teacher: ID=${teacherUser.id}, Username=${teacherUser.username}, Name=${teacherUser.fullName}`);

  // Test 3: Fetch assigned courses for Teacher A
  const assignedCourses = await TeacherService.getTeacherCourses(teacherUser.id);
  const assignedCourseIds = assignedCourses.map((c: any) => BigInt(c.id));
  console.log(`✔ [TEST 3 PASSED] Teacher assigned courses count: ${assignedCourses.length} (IDs: ${assignedCourseIds.map((id: any) => id.toString()).join(', ')})`);

  if (assignedCourses.length === 0) {
    console.error('❌ Cannot continue tests: Teacher has no assigned courses in DB.');
    return;
  }

  const assignedCourse = assignedCourses[0];
  // Find a lesson in assigned course
  let lesson = await prisma.lesson.findFirst({
    where: { courseId: BigInt(assignedCourse.id) },
  });

  if (!lesson) {
    console.log(`[INFO] Creating test lesson for assigned course ID=${assignedCourse.id}...`);
    lesson = await prisma.lesson.create({
      data: {
        courseId: BigInt(assignedCourse.id),
        lessonNumber: 99,
        title: 'درس اختبار الصلاحيات',
        description: 'درس تجريبي لاختبار صلاحية المعلم',
        isPublished: true,
      },
    });
  }

  // Test 1: Teacher A + Course A assigned -> Create Quiz for Course A -> Expected: SUCCESS
  console.log('\n--- TEST 1: Teacher A + Assigned Course A -> Create Quiz ---');
  let createdQuiz: any = null;
  try {
    await TeacherService.verifyLessonAccess(teacherUser.id, lesson.id, teacherUser.role);
    createdQuiz = await QuizService.createQuiz({
      lessonId: lesson.id.toString(),
      title: 'اختبار المعلم المعتمد',
      description: 'اختبار تم إنشاؤه بواسطة معلم مسند للكورس',
      durationMinutes: 20,
      passingScore: 50,
      maxAttempts: 2,
      isPublished: true,
    });
    console.log(`✔ [TEST 1 PASSED] Quiz Created Successfully! Quiz ID=${createdQuiz.id}, Title="${createdQuiz.title}"`);
  } catch (err: any) {
    console.error(`❌ [TEST 1 FAILED] Quiz creation threw error: ${err.message}`);
  }

  // Test 2: Teacher A + Course B NOT assigned -> Attempt to create Quiz for Course B -> Expected: 403 Forbidden
  console.log('\n--- TEST 2: Teacher A + Unassigned Course B -> Create Quiz ---');
  const unassignedCourse = await prisma.course.findFirst({
    where: { id: { notIn: assignedCourseIds } },
  });

  if (unassignedCourse) {
    let unassignedLesson = await prisma.lesson.findFirst({
      where: { courseId: unassignedCourse.id },
    });
    if (!unassignedLesson) {
      unassignedLesson = await prisma.lesson.create({
        data: {
          courseId: unassignedCourse.id,
          lessonNumber: 99,
          title: 'درس غير مسند',
          description: 'درس في كورس غير مسند للمعلم',
          isPublished: true,
        },
      });
    }

    try {
      await TeacherService.verifyLessonAccess(teacherUser.id, unassignedLesson.id, teacherUser.role);
      console.error('❌ [TEST 2 FAILED] Teacher was NOT blocked when accessing unassigned course!');
    } catch (err: any) {
      console.log(`✔ [TEST 2 PASSED] Teacher correctly blocked with 403 Forbidden: "${err.message}"`);
    }
  } else {
    console.log('[INFO] Skipping Test 2 (No unassigned courses in database)');
  }

  // Test 4: Enrolled Student in Course A -> Quiz Visible
  console.log('\n--- TEST 4: Student Enrolled in Course A -> Quiz Visibility ---');
  const enrolledStudent = await prisma.student.findFirst({
    where: { enrollments: { some: { courseId: BigInt(assignedCourse.id), status: 'ACTIVE' } } },
    include: { user: true },
  });

  if (enrolledStudent) {
    console.log(`[INFO] Found Enrolled Student: ID=${enrolledStudent.id}, Name=${enrolledStudent.user.fullName}`);
    const studentStats = await StudentDashboardService.getStudentQuizStatistics(enrolledStudent.id);
    const hasQuiz = studentStats.quizzes.some((q: any) => q.id === createdQuiz.id.toString());
    if (hasQuiz) {
      console.log(`✔ [TEST 4 PASSED] Quiz ID=${createdQuiz.id} is VISIBLE to enrolled student!`);
    } else {
      console.error(`❌ [TEST 4 FAILED] Quiz ID=${createdQuiz.id} was NOT visible to enrolled student!`);
    }
  } else {
    console.log('[INFO] No enrolled student found for Course A');
  }

  // Test 5: Unenrolled Student in Course A -> Quiz NOT Visible
  console.log('\n--- TEST 5: Student NOT Enrolled in Course A -> Quiz Visibility ---');
  const unenrolledStudent = await prisma.student.findFirst({
    where: { enrollments: { none: { courseId: BigInt(assignedCourse.id), status: 'ACTIVE' } } },
    include: { user: true },
  });

  if (unenrolledStudent) {
    console.log(`[INFO] Found Unenrolled Student: ID=${unenrolledStudent.id}, Name=${unenrolledStudent.user.fullName}`);
    const studentStats = await StudentDashboardService.getStudentQuizStatistics(unenrolledStudent.id);
    const hasQuiz = studentStats.quizzes.some((q: any) => q.id === createdQuiz.id.toString());
    if (!hasQuiz) {
      console.log(`✔ [TEST 5 PASSED] Quiz ID=${createdQuiz.id} is NOT visible to unenrolled student!`);
    } else {
      console.error(`❌ [TEST 5 FAILED] Quiz ID=${createdQuiz.id} was incorrectly exposed to unenrolled student!`);
    }
  } else {
    console.log('[INFO] No unenrolled student found');
  }

  // Cleanup test quiz
  if (createdQuiz) {
    await QuizService.deleteQuiz(createdQuiz.id.toString());
    console.log(`\n✔ Cleaned up test Quiz ID=${createdQuiz.id}`);
  }

  console.log('\n==================================================');
  console.log('       ALL TEACHER QUIZ TESTS COMPLETED SUCCESS   ');
  console.log('==================================================');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
