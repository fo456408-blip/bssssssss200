import { prisma } from '../config/database';
import { QuizRepository } from '../repositories/quiz.repository';
import { ApiError } from '../utils/apiError';
import {
  createQuizSchema,
  updateQuizSchema,
  createQuestionSchema,
  updateQuestionSchema,
  reorderQuestionsSchema,
  submitAttemptSchema,
} from '../validators/quiz.validator';

export class QuizService {
  private static serialize(obj: any): any {
    return JSON.parse(
      JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
  }

  // Sanitizer helper: Removes 'isCorrect' from option objects when sending payloads to students
  private static sanitizeForStudent(quiz: any): any {
    const serialized = this.serialize(quiz);
    if (!serialized || !serialized.questions) return serialized;

    serialized.questions = serialized.questions.map((q: any) => ({
      id: q.id,
      quizId: q.quizId,
      questionType: q.questionType,
      questionText: q.questionText,
      points: q.points,
      displayOrder: q.displayOrder,
      options: (q.options || []).map((opt: any) => ({
        id: opt.id,
        questionId: opt.questionId,
        optionText: opt.optionText,
        displayOrder: opt.displayOrder,
        // CRITICAL SECURITY RULE: NO isCorrect exposed to student!
      })),
    }));

    return serialized;
  }

  // 1. QUIZ MANAGEMENT SERVICES (ADMIN & TEACHER)
  static async getQuizzesByLesson(lessonId: string, onlyPublished: boolean = false) {
    const quizzes = await QuizRepository.findQuizzesByLesson(BigInt(lessonId), onlyPublished);
    return this.serialize(quizzes);
  }

  static async getQuizById(id: string, isStudent: boolean = false) {
    const quiz = await QuizRepository.findQuizById(BigInt(id));
    if (!quiz) throw ApiError.notFound('الاختبار غير موجود');

    if (isStudent) {
      return this.sanitizeForStudent(quiz);
    }

    return this.serialize(quiz);
  }

  static async createQuiz(input: any) {
    const data = createQuizSchema.parse(input);

    const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(data.lessonId) } });
    if (!lesson) throw ApiError.badRequest('الدرس غير موجود');

    const quiz = await prisma.quiz.create({
      data: {
        lessonId: BigInt(data.lessonId),
        title: data.title,
        description: data.description || null,
        durationMinutes: data.durationMinutes,
        passingScore: data.passingScore,
        maxAttempts: data.maxAttempts,
        isPublished: data.isPublished,
      },
    });

    return this.serialize(quiz);
  }

  static async updateQuiz(id: string, input: any) {
    const data = updateQuizSchema.parse(input);
    const quiz = await prisma.quiz.findUnique({ where: { id: BigInt(id) } });
    if (!quiz) throw ApiError.notFound('الاختبار غير موجود');

    const updated = await prisma.quiz.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.durationMinutes !== undefined && { durationMinutes: data.durationMinutes }),
        ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
        ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
      },
    });

    return this.serialize(updated);
  }

  static async deleteQuiz(id: string) {
    const qId = BigInt(id);
    const quiz = await prisma.quiz.findUnique({ where: { id: qId } });
    if (!quiz) throw ApiError.notFound('الاختبار غير موجود');

    await prisma.$transaction(async (tx) => {
      // Find all questions
      const questions = await tx.quizQuestion.findMany({ where: { quizId: qId }, select: { id: true } });
      const questionIds = questions.map((q) => q.id);

      // Find all attempts
      const attempts = await tx.quizAttempt.findMany({ where: { quizId: qId }, select: { id: true } });
      const attemptIds = attempts.map((a) => a.id);

      // Delete QuizAnswers
      if (attemptIds.length > 0) {
        await tx.quizAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      }

      // Delete QuizAttempts
      await tx.quizAttempt.deleteMany({ where: { quizId: qId } });

      // Delete QuizOptions
      if (questionIds.length > 0) {
        await tx.quizOption.deleteMany({ where: { questionId: { in: questionIds } } });
      }

      // Delete QuizQuestions
      await tx.quizQuestion.deleteMany({ where: { quizId: qId } });

      // Delete Quiz
      await tx.quiz.delete({ where: { id: qId } });
    });

    return { message: 'تم حذف الاختبار وكافة بياناته بنجاح' };
  }

  static async deleteQuestion(questionId: string) {
    const qId = BigInt(questionId);
    const question = await prisma.quizQuestion.findUnique({ where: { id: qId } });
    if (!question) throw ApiError.notFound('السؤال غير موجود');

    await prisma.$transaction(async (tx) => {
      await tx.quizAnswer.deleteMany({ where: { questionId: qId } });
      await tx.quizOption.deleteMany({ where: { questionId: qId } });
      await tx.quizQuestion.delete({ where: { id: qId } });
    });

    return { message: 'تم حذف السؤال بنجاح' };
  }

  // 2. QUESTION & OPTION MANAGEMENT
  static async addQuestion(input: any) {
    const data = createQuestionSchema.parse(input);

    const quiz = await prisma.quiz.findUnique({ where: { id: BigInt(data.quizId) } });
    if (!quiz) throw ApiError.notFound('الاختبار غير موجود');

    if (data.questionType === 'TRUE_FALSE' && data.options.length !== 2) {
      throw ApiError.badRequest('سؤال صح/خطأ يجب أن يحتوي على اختيارين فقط بالضبط');
    }

    const question = await prisma.$transaction(async (tx) => {
      const q = await tx.quizQuestion.create({
        data: {
          quizId: BigInt(data.quizId),
          type: data.questionType,
          questionText: data.questionText,
          points: data.points,
          imageUrl: data.imageUrl || null,
          questionOrder: data.displayOrder,
        },
      });

      for (const opt of data.options) {
        await tx.quizOption.create({
          data: {
            questionId: q.id,
            optionText: opt.optionText,
            isCorrect: opt.isCorrect,
            optionOrder: opt.displayOrder,
          },
        });
      }

      return tx.quizQuestion.findUnique({
        where: { id: q.id },
        include: { options: true },
      });
    });

    return this.serialize(question);
  }

  static async updateQuestion(questionId: string, input: any) {
    const data = updateQuestionSchema.parse(input);
    const qId = BigInt(questionId);

    const existing = await prisma.quizQuestion.findUnique({ where: { id: qId }, include: { options: true } });
    if (!existing) throw ApiError.notFound('السؤال غير موجود');

    const question = await prisma.$transaction(async (tx) => {
      await tx.quizQuestion.update({
        where: { id: qId },
        data: {
          ...(data.questionText ? { questionText: data.questionText } : {}),
          ...(data.questionType ? { type: data.questionType } : {}),
          ...(data.points !== undefined ? { points: data.points } : {}),
          ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
        },
      });

      if (data.options && data.options.length > 0) {
        await tx.quizOption.deleteMany({ where: { questionId: qId } });
        for (const opt of data.options) {
          await tx.quizOption.create({
            data: {
              questionId: qId,
              optionText: opt.optionText,
              isCorrect: opt.isCorrect,
              optionOrder: opt.displayOrder,
            },
          });
        }
      }

      return tx.quizQuestion.findUnique({
        where: { id: qId },
        include: { options: true },
      });
    });

    return this.serialize(question);
  }

  static async reorderQuestions(quizId: string, input: any) {
    const { orders } = reorderQuestionsSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      for (const item of orders) {
        await tx.quizQuestion.update({
          where: { id: BigInt(item.questionId) },
          data: { questionOrder: item.displayOrder },
        });
      }
    });

    return this.getQuizById(quizId, false);
  }

  // 3. STUDENT QUIZ ATTEMPT & AUTO-GRADING
  static async startAttempt(quizId: string, studentId: string) {
    const quiz = await QuizRepository.findQuizById(BigInt(quizId));
    if (!quiz) throw ApiError.notFound('الاختبار غير موجود');

    // Security Check 1: Quiz & Lesson publication
    if (!quiz.isPublished || !quiz.lesson.isPublished) {
      throw ApiError.forbidden('هذا الاختبار غير متاح حالياً (غير منشور)');
    }

    // Security Check 2: Student active enrollment
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: BigInt(studentId), courseId: quiz.lesson.courseId, status: 'ACTIVE' },
    });
    if (!enrollment) {
      throw ApiError.forbidden('غير مصرح لك ببدء اختبار كورس غير مشترك فيه');
    }

    // Security Check 3: Maximum Attempts Limit
    const completedCount = await QuizRepository.countCompletedAttempts(BigInt(quizId), BigInt(studentId));
    if (completedCount >= quiz.maxAttempts) {
      throw ApiError.badRequest(`لقد استنفدت الحد الأقصى للمحاولات المتاحة (${quiz.maxAttempts} محاولة)`);
    }

    // Check if an in-progress attempt already exists
    const existingInProgress = await prisma.quizAttempt.findFirst({
      where: { quizId: BigInt(quizId), studentId: BigInt(studentId), status: 'IN_PROGRESS' },
    });

    if (existingInProgress) {
      return {
        attempt: this.serialize(existingInProgress),
        quiz: this.sanitizeForStudent(quiz),
      };
    }

    const nextAttemptNumber = completedCount + 1;

    const newAttempt = await prisma.quizAttempt.create({
      data: {
        quizId: BigInt(quizId),
        studentId: BigInt(studentId),
        attemptNumber: nextAttemptNumber,
        startTime: new Date(),
        status: 'IN_PROGRESS',
      },
    });

    return {
      attempt: this.serialize(newAttempt),
      quiz: this.sanitizeForStudent(quiz),
    };
  }

  static async submitAttempt(attemptId: string, studentId: string, input: any) {
    const { answers } = submitAttemptSchema.parse(input);

    const attempt = await QuizRepository.findAttemptById(BigInt(attemptId));
    if (!attempt) throw ApiError.notFound('محاولة الاختبار غير موجودة');

    if (attempt.studentId.toString() !== studentId) {
      throw ApiError.forbidden('غير مصرح لك بتسليم محاولة طالب آخر');
    }

    if (attempt.status !== 'IN_PROGRESS') {
      throw ApiError.badRequest('تم تسليم هذه المحاولة بالفعل مسبقاً');
    }

    const quiz = attempt.quiz;
    const validQuestionIds = new Set(quiz.questions.map((q) => q.id.toString()));

    // Strict Cross-Quiz & Cross-Question Option Validation
    for (const ans of answers) {
      if (!validQuestionIds.has(ans.questionId)) {
        throw ApiError.badRequest(`السؤال رقم ${ans.questionId} لا ينتمي لهذا الاختبار`);
      }

      const targetQuestion = quiz.questions.find((q) => q.id.toString() === ans.questionId);
      const validOptionIds = new Set(targetQuestion?.options.map((o) => o.id.toString()));

      if (!validOptionIds.has(ans.selectedOptionId)) {
        throw ApiError.badRequest(`الإجابة المختارة رقم ${ans.selectedOptionId} لا تنتمي للسؤال رقم ${ans.questionId}`);
      }
    }

    const now = new Date();

    // Strict Timer Expiration (startTime + durationMinutes * 60 * 1000)
    const maxAllowedTimeMs = quiz.durationMinutes * 60 * 1000;
    const isExpired = now.getTime() - attempt.startTime.getTime() > maxAllowedTimeMs;

    // AUTO-GRADING TRANSACTION
    const result = await prisma.$transaction(async (tx) => {
      let totalPossiblePoints = 0;
      let totalEarnedPoints = 0;

      for (const question of quiz.questions) {
        totalPossiblePoints += question.points;

        const submittedAnswer = answers.find((a) => a.questionId === question.id.toString());
        let selectedOptionId: bigint | null = null;
        let isCorrect = false;
        let pointsAwarded = 0;

        if (submittedAnswer) {
          selectedOptionId = BigInt(submittedAnswer.selectedOptionId);
          const correctOption = question.options.find((opt) => opt.isCorrect);

          if (correctOption && correctOption.id.toString() === submittedAnswer.selectedOptionId) {
            isCorrect = true;
            pointsAwarded = question.points;
            totalEarnedPoints += question.points;
          }
        }

        await tx.quizAnswer.create({
          data: {
            attemptId: BigInt(attemptId),
            questionId: question.id,
            selectedOptionId,
            isCorrect,
            pointsAwarded,
          },
        });
      }

      const percentage = totalPossiblePoints > 0 ? (totalEarnedPoints / totalPossiblePoints) * 100 : 0;
      const isPassed = percentage >= quiz.passingScore;
      const finalStatus = isExpired ? 'EXPIRED' : 'SUBMITTED';

      const updatedAttempt = await tx.quizAttempt.update({
        where: { id: BigInt(attemptId) },
        data: {
          endTime: now,
          score: totalEarnedPoints,
          isPassed,
          status: finalStatus,
        },
      });

      return {
        attempt: updatedAttempt,
        totalQuestions: quiz.questions.length,
        totalPossiblePoints,
        earnedPoints: totalEarnedPoints,
        percentage: Math.round(percentage * 10) / 10,
        isPassed,
        status: finalStatus,
      };
    });

    return this.serialize(result);
  }

  static async getStudentAttempts(quizId: string, studentId: string) {
    const attempts = await QuizRepository.findAttempts(BigInt(quizId), BigInt(studentId));
    return this.serialize(attempts);
  }
}
