import app from '../app';
import { prisma } from '../config/database';
import { Server } from 'http';
import { JwtUtils } from './jwt';

const PORT = 5012;
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
      console.log(`Teacher Group Operations E2E Test Server started on port ${PORT}`);
      resolve();
    });
  });
}

async function runTests() {
  await setupServer();
  console.log('\n========================================');
  console.log('STARTING TEACHER GROUP OPERATIONS & SECURITY E2E AUDIT');
  console.log('========================================\n');

  try {
    // 1. Discover a valid Teacher and assigned Course from DB
    const teacher = await prisma.teacher.findFirst({
      where: { teacherCourses: { some: {} } },
      include: { user: true, teacherCourses: { include: { course: true } } },
    });

    if (!teacher || teacher.teacherCourses.length === 0) {
      recordTest('Teacher Setup', false, 'No teacher with assigned course found in DB');
      return;
    }

    const assignedCourse = teacher.teacherCourses[0].course;
    const teacherToken = JwtUtils.signToken({
      userId: teacher.userId.toString(),
      username: teacher.user.username,
      role: 'TEACHER',
    });

    recordTest(
      'Teacher Discovery',
      true,
      `Teacher "${teacher.user.fullName}" assigned to Course "${assignedCourse.name}" (ID: ${assignedCourse.id})`
    );

    // 2. Discover an unassigned Course for negative authorization tests
    let unassignedCourse = await prisma.course.findFirst({
      where: { id: { notIn: teacher.teacherCourses.map((tc) => tc.courseId) } },
    });

    if (!unassignedCourse) {
      // Create a temporary unassigned course for isolation testing
      const academicYear = await prisma.academicYear.findFirst();
      unassignedCourse = await prisma.course.create({
        data: {
          academicYearId: academicYear!.id,
          code: `UNASSIGNED_COURSE_${Math.floor(Math.random() * 90000 + 10000)}`,
          name: 'كورس خاص بمدرس آخر',
        },
      });
    }

    // Create an unassigned group under the unassigned course for negative group access testing
    const unassignedGroup = await prisma.group.create({
      data: {
        courseId: unassignedCourse.id,
        name: 'مجموعة غير مسندة للمدرس الحالي',
        maxCapacity: 25,
      },
    });

    // Discover or create a student for group student tests
    let student = await prisma.student.findFirst({ include: { user: true } });
    if (!student) {
      const user = await prisma.user.create({
        data: {
          username: `group_test_student_${Math.floor(Math.random() * 90000 + 10000)}`,
          passwordHash: 'dummy',
          fullName: 'طالب اختباري للمجموعة',
          role: 'STUDENT',
        },
      });
      student = await prisma.student.create({
        data: {
          userId: user.id,
          grade: 'FIRST_SECONDARY',
        },
        include: { user: true },
      });
    }

    // Ensure student is enrolled in assigned course for positive add test
    let enrollment = await prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId: assignedCourse.id } },
    });
    if (!enrollment) {
      enrollment = await prisma.enrollment.create({
        data: {
          studentId: student.id,
          courseId: assignedCourse.id,
          academicYearId: assignedCourse.academicYearId,
          monthlyFee: 100,
          status: 'ACTIVE',
        },
      });
    }

    // ----------------------------------------------------
    // TEST 1: Teacher Creates Group in Assigned Course (201)
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Teacher Group Creation ---');
    const groupName = `مجموعة التفوق_${Math.floor(Math.random() * 9000 + 1000)}`;
    const createRes = await fetch(`${BASE_URL}/teacher/groups`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: assignedCourse.id.toString(),
        name: groupName,
        maxCapacity: 35,
        schedules: [{ dayOfWeek: 'SATURDAY', startTime: '16:00', endTime: '18:00' }],
      }),
    });

    const createData = await createRes.json();
    const createdGroupId = createData.data?.id;
    recordTest(
      'Teacher Group Creation',
      createRes.status === 201 && Boolean(createdGroupId),
      `Status=${createRes.status}, Created Group ID=${createdGroupId || 'N/A'}`
    );

    // Verify DB persistence
    if (createdGroupId) {
      const dbGroup = await prisma.group.findUnique({ where: { id: BigInt(createdGroupId) } });
      recordTest('Group Creation Persistence', Boolean(dbGroup && dbGroup.name === groupName), `DB Group Name="${dbGroup?.name}"`);
    }

    // ----------------------------------------------------
    // TEST 2: Teacher Edits Assigned Group (200)
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Teacher Group Editing ---');
    const updatedGroupName = `${groupName}_معدلة`;
    const editRes = await fetch(`${BASE_URL}/teacher/groups/${createdGroupId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: updatedGroupName,
        maxCapacity: 40,
      }),
    });

    const editData = await editRes.json();
    recordTest(
      'Teacher Group Edit',
      editRes.status === 200 && editData.data?.name === updatedGroupName,
      `Status=${editRes.status}, Updated Name="${editData.data?.name}"`
    );

    // ----------------------------------------------------
    // TEST 3: Teacher Group Student Management (201, 200, 200)
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Teacher Group Student Management ---');
    // Add student to group
    const addStudRes = await fetch(`${BASE_URL}/teacher/groups/${createdGroupId}/students`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentId: student.id.toString() }),
    });
    recordTest('Teacher Add Student to Group', addStudRes.status === 201, `Status=${addStudRes.status}`);

    // List group students
    const listStudRes = await fetch(`${BASE_URL}/teacher/groups/${createdGroupId}/students`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const listStudData = await listStudRes.json();
    const hasStudentInGroup = Array.isArray(listStudData.data) && listStudData.data.some((gs: any) => gs.studentId.toString() === student.id.toString());
    recordTest('Teacher List Group Students', listStudRes.status === 200 && hasStudentInGroup, `Status=${listStudRes.status}, Found Student=${hasStudentInGroup}`);

    // Remove student from group
    const remStudRes = await fetch(`${BASE_URL}/teacher/groups/${createdGroupId}/students/${student.id.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    recordTest('Teacher Remove Student from Group', remStudRes.status === 200, `Status=${remStudRes.status}`);

    // ----------------------------------------------------
    // TEST 4: Teacher Security Authorization (Cross-Course 403 Guards)
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Teacher Security Authorization (Cross-Course 403 Guards) ---');

    // 4a. Teacher tries to create group in unassigned course (403)
    const unauthorizedCreateRes = await fetch(`${BASE_URL}/teacher/groups`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: unassignedCourse.id.toString(),
        name: 'مجموعة غير مصرح بها',
        maxCapacity: 20,
      }),
    });
    recordTest(
      'Security Guard: Group Creation in Unassigned Course',
      unauthorizedCreateRes.status === 403,
      `Status=${unauthorizedCreateRes.status} (Expected 403 Forbidden)`
    );

    // 4b. Teacher tries to edit group in unassigned course (403)
    const unauthorizedEditRes = await fetch(`${BASE_URL}/teacher/groups/${unassignedGroup.id.toString()}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'محاولة اختراق اسم المجموعة' }),
    });
    recordTest(
      'Security Guard: Group Edit in Unassigned Course',
      unauthorizedEditRes.status === 403,
      `Status=${unauthorizedEditRes.status} (Expected 403 Forbidden)`
    );

    // 4c. Teacher tries to list students of unassigned group (403)
    const unauthorizedListStudRes = await fetch(`${BASE_URL}/teacher/groups/${unassignedGroup.id.toString()}/students`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    recordTest(
      'Security Guard: List Group Students in Unassigned Group',
      unauthorizedListStudRes.status === 403,
      `Status=${unauthorizedListStudRes.status} (Expected 403 Forbidden)`
    );

    // 4d. Teacher tries to add student to unassigned group (403)
    const unauthorizedAddStudRes = await fetch(`${BASE_URL}/teacher/groups/${unassignedGroup.id.toString()}/students`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentId: student.id.toString() }),
    });
    recordTest(
      'Security Guard: Add Student to Unassigned Group',
      unauthorizedAddStudRes.status === 403,
      `Status=${unauthorizedAddStudRes.status} (Expected 403 Forbidden)`
    );

    // 4e. Teacher tries to delete unassigned group (403)
    const unauthorizedDelRes = await fetch(`${BASE_URL}/teacher/groups/${unassignedGroup.id.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    recordTest(
      'Security Guard: Delete Unassigned Group',
      unauthorizedDelRes.status === 403,
      `Status=${unauthorizedDelRes.status} (Expected 403 Forbidden)`
    );

    // ----------------------------------------------------
    // TEST 5: Teacher Deletes Assigned Group (200) & Cleanup
    // ----------------------------------------------------
    console.log('\n--- 5. Testing Teacher Group Deletion & Cleanup ---');
    if (createdGroupId) {
      const deleteRes = await fetch(`${BASE_URL}/teacher/groups/${createdGroupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      recordTest('Teacher Group Deletion', deleteRes.status === 200, `Status=${deleteRes.status}`);

      const dbGroupAfterDelete = await prisma.group.findUnique({ where: { id: BigInt(createdGroupId) } });
      recordTest('Group Deletion Persistence Verification', dbGroupAfterDelete === null, 'Group successfully removed from DB');
    }

    // Clean up temporary unassigned group
    await prisma.group.delete({ where: { id: unassignedGroup.id } });
  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
    await prisma.$disconnect();

    console.log('\n========================================');
    console.log(`TEACHER GROUP AUDIT COMPLETED: PASS = ${passCount}, FAIL = ${failCount}`);
    console.log('========================================\n');
  }
}

runTests();
