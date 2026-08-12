import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export class LessonRepository {
  // 1. LESSONS
  static async findLessonsByCourse(courseId: bigint, onlyPublished: boolean = false) {
    const where: Prisma.LessonWhereInput = { courseId };
    if (onlyPublished) {
      where.isPublished = true;
    }

    return prisma.lesson.findMany({
      where,
      orderBy: { lessonNumber: 'asc' },
      include: {
        videos: {
          select: { id: true, title: true, durationSeconds: true, createdAt: true },
        },
        _count: { select: { quizzes: true, assignments: true, classSessions: true } },
      },
    });
  }

  static async findLessonById(id: bigint) {
    return prisma.lesson.findUnique({
      where: { id },
      include: {
        course: { include: { academicYear: true } },
        videos: true,
        quizzes: { select: { id: true, title: true, durationMinutes: true, isPublished: true } },
        assignments: { select: { id: true, title: true, dueDate: true } },
      },
    });
  }

  // 2. VIDEOS
  static async findVideoById(id: bigint) {
    return prisma.lessonVideo.findUnique({
      where: { id },
      include: {
        lesson: {
          include: {
            course: true,
          },
        },
      },
    });
  }

  // 3. STUDENT PROGRESS
  static async findProgress(studentId: bigint, lessonId: bigint) {
    return prisma.studentLessonProgress.findUnique({
      where: {
        studentId_lessonId: {
          studentId,
          lessonId,
        },
      },
    });
  }
}
