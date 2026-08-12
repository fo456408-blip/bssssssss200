import { prisma } from '../config/database';

export class QuizRepository {
  // 1. QUIZZES
  static async findQuizzesByLesson(lessonId: bigint, onlyPublished: boolean = false) {
    return prisma.quiz.findMany({
      where: {
        lessonId,
        ...(onlyPublished ? { isPublished: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
    });
  }

  static async findQuizById(id: bigint) {
    return prisma.quiz.findUnique({
      where: { id },
      include: {
        lesson: { include: { course: true } },
        questions: {
          orderBy: { questionOrder: 'asc' },
          include: {
            options: {
              orderBy: { optionOrder: 'asc' },
            },
          },
        },
      },
    });
  }

  // 2. ATTEMPTS
  static async findAttempts(quizId: bigint, studentId: bigint) {
    return prisma.quizAttempt.findMany({
      where: { quizId, studentId },
      orderBy: { attemptNumber: 'desc' },
      include: {
        answers: {
          include: {
            question: true,
            selectedOption: true,
          },
        },
      },
    });
  }

  static async findAttemptById(attemptId: bigint) {
    return prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            questions: {
              include: { options: true },
            },
          },
        },
        student: { include: { user: true } },
        answers: true,
      },
    });
  }

  static async countCompletedAttempts(quizId: bigint, studentId: bigint) {
    return prisma.quizAttempt.count({
      where: {
        quizId,
        studentId,
        status: { in: ['SUBMITTED', 'EXPIRED'] },
      },
    });
  }
}
