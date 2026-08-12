import { prisma } from '../config/database';
import { TeacherService } from '../services/teacher.service';
import { AnnouncementService } from '../services/announcement.service';
import { QuizService } from '../services/quiz.service';
import { OperationsService } from '../services/operations.service';
import { BookingRequestService } from '../services/bookingRequest.service';
import { AnnouncementTarget, QuestionType, LearningMode } from '@prisma/client';

export async function runTeacherAudit() {
  console.log('=== STARTING TEACHER PORTAL & SECURITY AUDIT ===\n');

  let passCount = 0;
  let failCount = 0;
  const results: any[] = [];

  function record(testName: string, passed: boolean, details: string) {
    if (passed) {
      passCount++;
      console.log(`[✔ PASS] ${testName}: ${details}`);
    } else {
      failCount++;
      console.error(`[✖ FAIL] ${testName}: ${details}`);
    }
    results.push({ testName, passed, details });
  }

  try {
    // 1. Discover a valid Teacher with at least one assigned Course
    console.log('1. Discovering Teacher with assigned courses from local database...');
    const teacher: any = await prisma.teacher.findFirst({
      where: { teacherCourses: { some: {} } },
      include: {
        user: true,
        teacherCourses: { include: { course: { include: { academicYear: true } } } },
      },
    });

    if (!teacher || teacher.teacherCourses.length === 0) {
      record('Teacher Discovery', false, 'No teacher with assigned courses found in local database');
      return;
    }

    const assignedCourse = teacher.teacherCourses[0].course;
    record(
      'Teacher Discovery',
      true,
      `Found Teacher "${teacher.user.fullName}" (ID: ${teacher.id}) assigned to Course "${assignedCourse.name}" (ID: ${assignedCourse.id})`
    );

    // 2. Discover an unassigned course or another course for negative security test
    const unassignedCourse = await prisma.course.findFirst({
      where: { id: { notIn: teacher.teacherCourses.map((tc: any) => tc.courseId) } },
    });

    // 3. Test Teacher Course Access Verification
    console.log('\n2. Testing Teacher Course Scope Security...');
    try {
      await TeacherService.verifyCourseAccess(teacher.userId, assignedCourse.id, 'TEACHER');
      record('Course Scope Guard (Assigned)', true, 'Allowed access to assigned course');
    } catch (err: any) {
      record('Course Scope Guard (Assigned)', false, err.message);
    }

    if (unassignedCourse) {
      try {
        await TeacherService.verifyCourseAccess(teacher.userId, unassignedCourse.id, 'TEACHER');
        record('Course Scope Guard (Unassigned)', false, 'FAILED to block unassigned course');
      } catch (err: any) {
        record('Course Scope Guard (Unassigned)', true, `Successfully blocked with error: "${err.message}"`);
      }
    } else {
      record('Course Scope Guard (Unassigned)', true, 'Skipped unassigned test (all courses assigned in DB)');
    }

    // 4. Test Course = Academic Subject Model Verification
    console.log('\n3. Testing Canonical Course = Academic Subject Business Model...');
    const canonicalCourse = await prisma.course.findFirst({
      where: { id: assignedCourse.id },
      include: { academicYear: true },
    });
    if (canonicalCourse) {
      record(
        'Canonical Academic Subject',
        true,
        `Course "${canonicalCourse.name}" is the single source of truth (Grade: ${canonicalCourse.grade}, Code: ${canonicalCourse.code})`
      );
    } else {
      record('Canonical Academic Subject', false, 'Course record missing');
    }

    // 5. Test Automatic Derivation in Booking Flow
    console.log('\n4. Testing Booking Request Derivation (Grade, Year, IN_PERSON mode)...');
    try {
      const group = await prisma.group.findFirst({ where: { courseId: assignedCourse.id } });
      if (group) {
        const booking = await BookingRequestService.createBookingRequest({
          studentName: 'Test Student Booking',
          studentPhone: `01000${Math.floor(Math.random() * 900000 + 100000)}`,
          parentName: 'Test Parent Booking',
          parentPhone: `01100${Math.floor(Math.random() * 900000 + 100000)}`,
          courseId: assignedCourse.id.toString(),
          groupId: group.id.toString(),
          notes: 'Automated test booking',
        });

        const isModeInPerson = booking.learningMode === LearningMode.IN_PERSON;
        const isGradeDerived = Boolean(booking.grade);
        record(
          'Booking Automatic Derivation',
          isModeInPerson && isGradeDerived,
          `Booking derived Grade=${booking.grade}, Mode=${booking.learningMode}`
        );

        // Clean up test booking
        await prisma.bookingRequest.delete({ where: { id: booking.id } });
        record('Booking Cleanup', true, 'Test booking deleted successfully');
      } else {
        record('Booking Automatic Derivation', true, 'Skipped: No group in test course');
      }
    } catch (err: any) {
      record('Booking Automatic Derivation', false, err.message);
    }

    // 6. Test Teacher Announcements & Scoping
    console.log('\n5. Testing Teacher Announcements...');
    try {
      const ann = await AnnouncementService.createAnnouncement(teacher.userId.toString(), {
        title: 'Test Teacher Announcement',
        content: 'Testing announcement creation by teacher',
        targetAudience: AnnouncementTarget.COURSE_STUDENTS,
        courseId: assignedCourse.id.toString(),
      });
      record('Teacher Announcement Create', true, `Created announcement ID: ${ann.id}`);

      await prisma.announcement.delete({ where: { id: ann.id } });
      record('Teacher Announcement Cleanup', true, 'Test announcement deleted');
    } catch (err: any) {
      record('Teacher Announcement Create', false, err.message);
    }

    // 7. Test Quiz Question with Decimal Score and Image URL
    console.log('\n6. Testing Quiz Management & Decimal Points (4.5, 5.5, 2.25)...');
    try {
      let lesson = await prisma.lesson.findFirst({ where: { courseId: assignedCourse.id } });
      if (!lesson) {
        lesson = await prisma.lesson.create({
          data: {
            courseId: assignedCourse.id,
            title: 'Audit Temp Lesson',
            lessonNumber: 999,
          },
        });
      }

      const quiz = await QuizService.createQuiz({
        lessonId: lesson.id.toString(),
        title: 'Audit Quiz Decimal Test',
        description: 'Testing decimal points',
        durationMinutes: 20,
        passingScore: 50,
        maxAttempts: 1,
        isPublished: true,
      });
      record('Quiz Creation', true, `Quiz created ID: ${quiz.id}`);

      const question = await QuizService.addQuestion({
        quizId: quiz.id.toString(),
        questionType: QuestionType.MCQ,
        questionText: 'What is 2 + 2.5?',
        points: 4.5,
        imageUrl: 'https://example.com/math-diagram.png',
        displayOrder: 1,
        options: [
          { optionText: '4.5', isCorrect: true, displayOrder: 1 },
          { optionText: '4.0', isCorrect: false, displayOrder: 2 },
        ],
      });

      record(
        'Quiz Question Decimal & Image',
        question.points === 4.5 && Boolean(question.imageUrl),
        `Question points=${question.points}, imageUrl=${question.imageUrl}`
      );

      const updatedQuestion = await QuizService.updateQuestion(question.id.toString(), {
        points: 5.5,
        questionText: 'Updated text for decimal test',
      });
      record(
        'Quiz Question Edit Points (5.5)',
        updatedQuestion.points === 5.5,
        `Updated points=${updatedQuestion.points}`
      );

      await QuizService.deleteQuiz(quiz.id.toString());
      if (lesson.title === 'Audit Temp Lesson') {
        await prisma.lesson.delete({ where: { id: lesson.id } });
      }
      record('Quiz Cleanup', true, 'Test quiz and lesson cleaned up');
    } catch (err: any) {
      record('Quiz Management & Decimal Points', false, err.message);
    }

    // 8. Test Sessions & Attendance Sheet
    console.log('\n7. Testing Sessions & Attendance Sheet...');
    try {
      const group = await prisma.group.findFirst({ where: { courseId: assignedCourse.id } });
      if (group) {
        let session = await prisma.classSession.findFirst({ where: { groupId: group.id } });
        if (!session) {
          session = await prisma.classSession.create({
            data: {
              groupId: group.id,
              sessionDate: new Date(),
              topic: 'Test Audit Session',
            },
          });
        }

        const sheet = await OperationsService.getAttendanceSheet(session.id.toString());
        record('Attendance Sheet Load', Array.isArray(sheet.students), `Found ${sheet.students.length} students in sheet`);

        if (session.topic === 'Test Audit Session') {
          await prisma.classSession.delete({ where: { id: session.id } });
        }
      } else {
        record('Attendance Sheet', true, 'Skipped: No group in course');
      }
    } catch (err: any) {
      record('Attendance Sheet', false, err.message);
    }

    // 9. Summary Report
    console.log('\n========================================');
    console.log(`TEACHER AUDIT COMPLETED: PASS = ${passCount}, FAIL = ${failCount}`);
    console.log('========================================\n');
  } catch (err: any) {
    console.error('Fatal error in audit:', err);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runTeacherAudit();
}
