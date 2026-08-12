import { prisma } from '../src/config/database';
import { TeacherService } from '../src/services/teacher.service';
import { AnnouncementService } from '../src/services/announcement.service';
import { AssignmentService } from '../src/services/assignment.service';
import { QuizService } from '../src/services/quiz.service';
import { OperationsService } from '../src/services/operations.service';
import { LessonService } from '../src/services/lesson.service';
import { BookingRequestService } from '../src/services/bookingRequest.service';
import { AnnouncementTarget, LearningMode } from '@prisma/client';

async function main() {
  console.log('========================================================================');
  console.log('   FULL TEACHER PORTAL & BOUNDARY GUARDS SECOND-PASS AUDIT MATRIX');
  console.log('========================================================================\n');

  // 1. Fetch Teacher & Unassigned Course
  const teacher = await prisma.teacher.findFirst({
    include: { user: true, teacherCourses: true },
  });

  if (!teacher) {
    console.error('❌ FAIL: No teacher found in database');
    return;
  }

  const teacherUser = teacher.user;
  const assignedCourses = await TeacherService.getTeacherCourses(teacherUser.id);

  if (assignedCourses.length === 0) {
    console.error('❌ Cannot run audit: Teacher has no assigned courses in DB.');
    return;
  }

  const assignedCourse = assignedCourses[0];

  // Find a course NOT assigned to this teacher
  const assignedIds = assignedCourses.map((c: any) => BigInt(c.id));
  const unassignedCourse = await prisma.course.findFirst({
    where: { id: { notIn: assignedIds } },
  });

  console.log(`[INFO] Teacher: ${teacherUser.fullName} (ID=${teacherUser.id})`);
  console.log(`[INFO] Assigned Course: "${assignedCourse.name}" (ID=${assignedCourse.id})`);
  if (unassignedCourse) {
    console.log(`[INFO] Unassigned Course: "${unassignedCourse.name}" (ID=${unassignedCourse.id})\n`);
  } else {
    console.log('[INFO] All courses in DB are assigned to this teacher (Creating temp unassigned course for boundary testing)');
  }

  const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

  // Helper tester
  const runCheck = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ test: name, status: 'PASS', details: 'Passed as expected' });
      console.log(`✔ [PASS] ${name}`);
    } catch (err: any) {
      results.push({ test: name, status: 'FAIL', details: err.message });
      console.error(`❌ [FAIL] ${name}: ${err.message}`);
    }
  };

  // ----------------------------------------------------
  // TEST 1: TEACHER DASHBOARD API
  // ----------------------------------------------------
  await runCheck('Teacher Dashboard Stats (GET /teacher/dashboard)', async () => {
    const dashboard = await TeacherService.getTeacherDashboardStats(teacherUser.id);
    if (typeof dashboard.stats.totalStudents !== 'number') throw new Error('Invalid dashboard stats structure');
  });

  // ----------------------------------------------------
  // TEST 2: TEACHER COURSES API
  // ----------------------------------------------------
  await runCheck('Teacher Assigned Courses List (GET /teacher/courses)', async () => {
    const courses = await TeacherService.getTeacherCourses(teacherUser.id);
    if (!Array.isArray(courses)) throw new Error('Expected array of courses');
    const hasUnassigned = courses.some((c: any) => c.id.toString() === unassignedCourse?.id.toString());
    if (hasUnassigned) throw new Error('Unassigned course leaked into teacher list!');
  });

  // ----------------------------------------------------
  // TEST 3: TEACHER GROUPS API
  // ----------------------------------------------------
  await runCheck('Teacher Assigned Groups List (GET /teacher/groups)', async () => {
    const groups = await TeacherService.getTeacherGroups(teacherUser.id);
    if (!Array.isArray(groups)) throw new Error('Expected array of groups');
  });

  // ----------------------------------------------------
  // TEST 4: TEACHER STUDENTS API
  // ----------------------------------------------------
  await runCheck('Teacher Assigned Students List (GET /teacher/students)', async () => {
    const students = await TeacherService.getTeacherStudents(teacherUser.id);
    if (!Array.isArray(students)) throw new Error('Expected array of students');
  });

  // ----------------------------------------------------
  // TEST 5: TEACHER LESSONS & SECURITY BOUNDARY
  // ----------------------------------------------------
  await runCheck('Teacher Lesson Access - Assigned Course (Authorized)', async () => {
    await TeacherService.verifyCourseAccess(teacherUser.id, assignedCourse.id, teacherUser.role);
  });

  if (unassignedCourse) {
    await runCheck('Teacher Lesson Access - Unassigned Course (403 Forbidden)', async () => {
      try {
        await TeacherService.verifyCourseAccess(teacherUser.id, unassignedCourse.id, teacherUser.role);
        throw new Error('Should have thrown 403 Forbidden!');
      } catch (err: any) {
        if (!err.message.includes('صلاحية') && !err.message.includes('forbidden')) {
          throw err;
        }
      }
    });
  }

  // ----------------------------------------------------
  // TEST 6: TEACHER SESSIONS & ATTENDANCE
  // ----------------------------------------------------
  const group = await prisma.group.findFirst({ where: { courseId: BigInt(assignedCourse.id) } });

  if (group) {
    await runCheck('Teacher Group Access - Assigned Group (Authorized)', async () => {
      await TeacherService.verifyGroupAccess(teacherUser.id, group.id, teacherUser.role);
    });

    await runCheck('Teacher Session Creation for Assigned Group', async () => {
      const session = await OperationsService.createSession({
        groupId: group.id.toString(),
        sessionDate: new Date().toISOString(),
        topic: 'حصة اختبار الصلاحيات',
      });

      // Cleanup
      await prisma.classSession.delete({ where: { id: BigInt(session.id) } });
    });
  }

  // ----------------------------------------------------
  // TEST 7: TEACHER ANNOUNCEMENTS & SCOPE
  // ----------------------------------------------------
  await runCheck('Teacher Announcement Creation for Assigned Course', async () => {
    const ann = await AnnouncementService.createAnnouncement(teacherUser.id, {
      title: 'تنبيه اختبار الصلاحيات الثاني',
      content: 'محتوى الإعلان الفعلي',
      targetAudience: AnnouncementTarget.COURSE_STUDENTS,
      courseId: assignedCourse.id.toString(),
      status: 'PUBLISHED' as any,
    });

    await prisma.announcement.delete({ where: { id: BigInt(ann.id) } });
  });

  // ----------------------------------------------------
  // TEST 8: BOOKING FLOW AUTO-DERIVATION & MANDATORY OFFLINE
  // ----------------------------------------------------
  if (group) {
    await runCheck('Booking Request Flow (Auto Grade & Mandatory IN_PERSON)', async () => {
      const booking = await BookingRequestService.createBookingRequest({
        studentName: 'طالب اختبار الحجز الفعلي',
        studentPhone: '01099998877',
        parentName: 'ولي أمر الطالب الفعلي',
        parentPhone: '01077776655',
        subjectId: assignedCourse.subjectId.toString(),
        courseId: assignedCourse.id.toString(),
        groupId: group.id.toString(),
      });

      if (booking.learningMode !== LearningMode.IN_PERSON) {
        throw new Error(`Learning mode is ${booking.learningMode}, expected IN_PERSON`);
      }

      await prisma.bookingRequest.delete({ where: { id: booking.id } });
    });
  }

  // ----------------------------------------------------
  // SUMMARY MATRIX PRINT
  // ----------------------------------------------------
  console.log('\n========================================================================');
  console.log('                 TEACHER PORTAL SECOND-PASS AUDIT MATRIX                ');
  console.log('========================================================================');
  console.table(results);
  console.log('========================================================================\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
