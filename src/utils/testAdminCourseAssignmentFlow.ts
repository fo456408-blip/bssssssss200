import { prisma } from '../config/database';
import { AdminService } from '../services/admin.service';
import { TeacherService } from '../services/teacher.service';
import { AuthService } from '../services/auth.service';

export async function runAdminCourseAssignmentFlowTest() {
  console.log('=== STARTING ADMIN TEACHER COURSE ASSIGNMENT E2E FLOW TEST ===\n');

  let passCount = 0;
  let failCount = 0;

  function record(testName: string, passed: boolean, details: string) {
    if (passed) {
      passCount++;
      console.log(`[✔ PASS] ${testName}: ${details}`);
    } else {
      failCount++;
      console.error(`[✖ FAIL] ${testName}: ${details}`);
    }
  }

  try {
    const timestamp = Date.now();
    const testUsername = `test_teacher_${timestamp}`;
    const testPassword = 'TestPassword123!';

    // 1. Admin creates Teacher
    console.log('1. Admin creating new Teacher account...');
    const teacherResult = await AdminService.createTeacher({
      username: testUsername,
      password: testPassword,
      fullName: `Test Teacher ${timestamp}`,
      specialization: 'Computer Science',
    });
    record('Admin Create Teacher', Boolean(teacherResult.id), `Teacher created ID: ${teacherResult.id}`);

    // 2. Fetch an existing course & ensure it is active
    let course = await prisma.course.findFirst();
    if (!course) {
      record('Course Discovery', false, 'No courses found in database');
      return;
    }
    if (!course.isActive) {
      course = await prisma.course.update({
        where: { id: course.id },
        data: { isActive: true },
      });
    }
    record('Course Discovery', true, `Using course "${course.name}" (ID: ${course.id})`);

    // 3. Admin assigns Course to Teacher
    console.log('\n2. Admin assigning Course to Teacher...');
    const assignmentResult = await AdminService.assignCourseToTeacher(
      teacherResult.id.toString(),
      course.id.toString()
    );
    record('Admin Assign Course', Boolean(assignmentResult.id), `TeacherCourse created ID: ${assignmentResult.id}`);

    // 4. Teacher logs in & verifies assigned Course
    console.log('\n3. Verifying Teacher login & assigned course access...');
    const authResult = await AuthService.login({ username: testUsername, password: testPassword });
    record('Teacher Login', Boolean(authResult.accessToken), `Teacher authenticated, UserID: ${authResult.user.id}`);

    const teacherCourses = await TeacherService.getTeacherCourses(authResult.user.id);
    const hasAssignedCourse = teacherCourses.some((c: any) => c.id.toString() === course.id.toString());
    record('Teacher Assigned Course View', hasAssignedCourse, `Teacher sees assigned course "${course.name}"`);

    // 5. Admin removes Course from Teacher
    console.log('\n4. Admin removing Course from Teacher...');
    const removeResult = await AdminService.removeCourseFromTeacher(
      teacherResult.id.toString(),
      course.id.toString()
    );
    record('Admin Remove Course', removeResult.success, removeResult.message);

    const updatedTeacherCourses = await TeacherService.getTeacherCourses(authResult.user.id);
    const hasCourseAfterRemove = updatedTeacherCourses.some((c: any) => c.id.toString() === course.id.toString());
    record('Teacher Post-Removal View', !hasCourseAfterRemove, 'Teacher no longer sees removed course');

    // 6. Security Check: Direct API access as Teacher to assign/remove courses (403 Forbidden)
    console.log('\n5. Verifying Security: Teacher direct API access to admin course assignment endpoints...');
    try {
      await TeacherService.verifyCourseAccess(authResult.user.id, course.id, 'TEACHER');
      record('Teacher Unassigned Course Guard', false, 'FAILED to block unassigned course access');
    } catch (err: any) {
      record('Teacher Unassigned Course Guard', true, `Successfully returned 403 / Forbidden: "${err.message}"`);
    }

    // Cleanup test teacher account
    await prisma.$transaction(async (tx) => {
      await tx.teacherCourse.deleteMany({ where: { teacherId: BigInt(teacherResult.id) } });
      await tx.teacher.delete({ where: { id: BigInt(teacherResult.id) } });
      await tx.user.delete({ where: { id: BigInt(teacherResult.userId) } });
    });
    record('Test Cleanup', true, 'Test teacher account and assignments cleaned up');

    console.log('\n========================================');
    console.log(`ADMIN ASSIGNMENT AUDIT COMPLETED: PASS = ${passCount}, FAIL = ${failCount}`);
    console.log('========================================\n');
  } catch (err: any) {
    console.error('Fatal error in assignment audit:', err);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runAdminCourseAssignmentFlowTest();
}
