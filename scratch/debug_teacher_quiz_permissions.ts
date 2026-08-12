import { prisma } from '../src/config/database';
import { JwtUtils } from '../src/utils/jwt';
import { TeacherService } from '../src/services/teacher.service';
import { QuizService } from '../src/services/quiz.service';

async function main() {
  console.log('--- DEBUGGING TEACHER QUIZ PERMISSIONS ---');

  // Find a teacher user
  const teacher = await prisma.teacher.findFirst({
    include: { user: true, teacherCourses: { include: { course: true } } },
  });

  if (!teacher) {
    console.log('No teacher found in database!');
    return;
  }

  const teacherUser = teacher.user;
  console.log(`Found Teacher: ID=${teacherUser.id}, Username=${teacherUser.username}, Role=${teacherUser.role}`);
  console.log(`Teacher Courses Count: ${teacher.teacherCourses.length}`);

  const assignedCourseIds = await TeacherService.getAssignedCourseIds(teacherUser.id);
  console.log(`Assigned Course IDs for Teacher:`, assignedCourseIds.map(id => id.toString()));

  // Get lessons for assigned courses
  const lessons = await prisma.lesson.findMany({
    where: { courseId: { in: assignedCourseIds } },
  });
  console.log(`Lessons in Teacher Courses Count: ${lessons.length}`);

  if (lessons.length > 0) {
    const targetLesson = lessons[0];
    console.log(`Testing lesson verification for Lesson ID ${targetLesson.id}...`);

    try {
      await TeacherService.verifyLessonAccess(teacherUser.id, targetLesson.id, teacherUser.role);
      console.log('✔ verifyLessonAccess passed!');
    } catch (err: any) {
      console.error('❌ verifyLessonAccess failed:', err.message);
    }
  }

  // Check unassigned course
  const unassignedCourse = await prisma.course.findFirst({
    where: { id: { notIn: assignedCourseIds } },
  });

  if (unassignedCourse) {
    console.log(`Found Unassigned Course ID ${unassignedCourse.id}`);
    const unassignedLesson = await prisma.lesson.findFirst({
      where: { courseId: unassignedCourse.id },
    });

    if (unassignedLesson) {
      try {
        await TeacherService.verifyLessonAccess(teacherUser.id, unassignedLesson.id, teacherUser.role);
        console.error('❌ FAILED: Teacher was allowed access to UNASSIGNED lesson!');
      } catch (err: any) {
        console.log(`✔ SUCCESS: Unassigned lesson blocked with 403: "${err.message}"`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
