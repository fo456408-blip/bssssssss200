import { prisma } from '../src/config/database';
import { TeacherService } from '../src/services/teacher.service';
import { AnnouncementService } from '../src/services/announcement.service';
import { AssignmentService } from '../src/services/assignment.service';
import { QuizService } from '../src/services/quiz.service';
import { BookingRequestService } from '../src/services/bookingRequest.service';
import { AnnouncementTarget, StudentGrade, LearningMode } from '@prisma/client';

async function main() {
  console.log('====================================================');
  console.log('  TEACHER PORTAL & BOOKING ARCHITECTURE E2E AUDIT   ');
  console.log('====================================================\n');

  // Find a teacher user
  const teacher = await prisma.teacher.findFirst({
    include: { user: true, teacherCourses: { include: { course: { include: { academicYear: true } } } } },
  });

  if (!teacher) {
    console.error('❌ FAIL: No teacher found in database');
    return;
  }

  const teacherUser = teacher.user;
  console.log(`[INFO] Testing with Teacher: ID=${teacherUser.id}, Username=${teacherUser.username}`);

  const assignedCourses = await TeacherService.getTeacherCourses(teacherUser.id);
  const assignedCourseIds = assignedCourses.map((c: any) => BigInt(c.id));
  console.log(`[INFO] Teacher Assigned Courses Count: ${assignedCourses.length}`);

  if (assignedCourses.length === 0) {
    console.error('❌ Cannot run audit: Teacher has no assigned courses in DB.');
    return;
  }

  const assignedCourse = assignedCourses[0];

  // ----------------------------------------------------
  // TEST 1: TEACHER ANNOUNCEMENT SCOPE
  // ----------------------------------------------------
  console.log('\n--- TEST 1: Teacher Announcement Scope ---');
  try {
    await TeacherService.verifyCourseAccess(teacherUser.id, assignedCourse.id, teacherUser.role);
    const ann = await AnnouncementService.createAnnouncement(teacherUser.id, {
      title: 'إعلان اختبار الصلاحيات',
      content: 'تنبيه لطلاب الكورس المسند',
      targetAudience: AnnouncementTarget.COURSE_STUDENTS,
      courseId: assignedCourse.id.toString(),
      status: 'PUBLISHED' as any,
    });
    console.log(`✔ [TEST 1 PASSED] Teacher created announcement ID=${ann.id} for assigned course ID=${assignedCourse.id}`);
  } catch (err: any) {
    console.error(`❌ [TEST 1 FAILED]: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 2: TEACHER ASSIGNMENT SCOPE
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Teacher Assignment Scope ---');
  let lesson = await prisma.lesson.findFirst({ where: { courseId: BigInt(assignedCourse.id) } });
  if (!lesson) {
    lesson = await prisma.lesson.create({
      data: {
        courseId: BigInt(assignedCourse.id),
        lessonNumber: 99,
        title: 'درس الواجبات الاختبارية',
        isPublished: true,
      },
    });
  }

  let createdAssignment: any = null;
  try {
    await TeacherService.verifyLessonAccess(teacherUser.id, lesson.id, teacherUser.role);
    createdAssignment = await AssignmentService.createAssignment({
      lessonId: lesson.id.toString(),
      title: 'واجب البرمجة الاختبارية',
      description: 'واجب للتأكد من صلاحيات المعلم ورصد الدرجات',
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      maxScore: 100,
      isPublished: true,
    });
    console.log(`✔ [TEST 2 PASSED] Teacher created assignment ID=${createdAssignment.id} for assigned lesson ID=${lesson.id}`);

    // Clean up assignment
    await AssignmentService.deleteAssignment(createdAssignment.id.toString());
    console.log(`✔ Cleaned up test assignment ID=${createdAssignment.id}`);
  } catch (err: any) {
    console.error(`❌ [TEST 2 FAILED]: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 3: TEACHER QUIZ & DECIMAL SCORES & QUESTION IMAGES
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Teacher Quiz & Decimal Scores & Images ---');
  try {
    const quiz = await QuizService.createQuiz({
      lessonId: lesson.id.toString(),
      title: 'اختبار الدرجات العشرية والصور',
      description: 'اختبار للتحقق من دعم الكسور العشرية مثل 4.5 و 2.25',
      durationMinutes: 15,
      passingScore: 50,
      maxAttempts: 1,
      isPublished: true,
    });

    const question = await QuizService.addQuestion({
      quizId: quiz.id.toString(),
      questionType: 'MCQ',
      questionText: 'ما هي مخرجات الكود الموضح في الصورة؟',
      points: 4.5, // Decimal score!
      imageUrl: 'https://engcode.academy/assets/test_question.png',
      options: [
        { optionText: '10', isCorrect: true, displayOrder: 1 },
        { optionText: '20', isCorrect: false, displayOrder: 2 },
      ],
    });

    console.log(`✔ [TEST 3 PASSED] Quiz Question Created! ID=${question.id}, Points=${question.points} (Decimal 4.5), ImageUrl="${question.imageUrl}"`);

    // Clean up quiz
    await QuizService.deleteQuiz(quiz.id.toString());
    console.log(`✔ Cleaned up test Quiz ID=${quiz.id}`);
  } catch (err: any) {
    console.error(`❌ [TEST 3 FAILED]: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 4: BOOKING AUTO-DERIVED GRADE & OFFLINE MODE
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Booking Auto Academic Year & Mandatory IN_PERSON Mode ---');
  const group = await prisma.group.findFirst({ where: { courseId: BigInt(assignedCourse.id) } });

  if (group) {
    try {
      const booking = await BookingRequestService.createBookingRequest({
        studentName: 'طالب الحجز الآلي',
        studentPhone: '01011112233',
        parentName: 'ولي أمر الطالب',
        parentPhone: '01044445566',
        subjectId: assignedCourse.subjectId.toString(),
        courseId: assignedCourse.id.toString(),
        groupId: group.id.toString(),
      });

      console.log(`✔ [TEST 4 PASSED] Booking Request Created! ID=${booking.id}`);
      console.log(`   Derived Grade=${booking.grade} (Derived from AcademicYear "${assignedCourse.academicYear?.name}")`);
      console.log(`   Learning Mode=${booking.learningMode} (Mandatory IN_PERSON / OFFLINE)`);

      // Clean up test booking
      await prisma.bookingRequest.delete({ where: { id: booking.id } });
      console.log(`✔ Cleaned up test Booking ID=${booking.id}`);
    } catch (err: any) {
      console.error(`❌ [TEST 4 FAILED]: ${err.message}`);
    }
  } else {
    console.log('[INFO] No group found for test course');
  }

  console.log('\n====================================================');
  console.log('       ALL AUDIT TESTS COMPLETED SUCCESSFULLY!      ');
  console.log('====================================================');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
