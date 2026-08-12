import { Request, Response, NextFunction } from 'express';
import { QuizService } from '../services/quiz.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { prisma } from '../config/database';

export class QuizController {
  // 1. QUIZ MANAGEMENT CONTROLLERS
  static async getQuizzesByLesson(req: Request, res: Response, next: NextFunction) {
    try {
      const lessonId = req.params.lessonId;

      if (req.user?.role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

        const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(lessonId) } });
        if (!lesson || !lesson.isPublished) throw ApiError.forbidden('الدرس غير متاح');

        const enrollment = await prisma.enrollment.findFirst({
          where: { studentId: studentProfile.id, courseId: lesson.courseId, status: 'ACTIVE' },
        });
        if (!enrollment) throw ApiError.forbidden('غير مصرح لك بالوصول لاختبارات كورس غير مشترك فيه');

        const quizzes = await QuizService.getQuizzesByLesson(lessonId, true); // Published only!
        return ApiResponse.success(res, 200, 'تم جلب اختبارات الدرس بنجاح', quizzes);
      }

      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyLessonAccess(req.user.userId, lessonId, req.user.role);
      }

      const quizzes = await QuizService.getQuizzesByLesson(lessonId, false);
      return ApiResponse.success(res, 200, 'تم جلب اختبارات الدرس بنجاح', quizzes);
    } catch (error) {
      next(error);
    }
  }

  static async getQuizById(req: Request, res: Response, next: NextFunction) {
    try {
      const isStudent = req.user?.role === 'student';
      const quiz = await QuizService.getQuizById(req.params.id, isStudent);

      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyQuizAccess(req.user.userId, req.params.id, req.user.role);
      }

      if (isStudent) {
        if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId.toString()) } });
        if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

        const enrollment = await prisma.enrollment.findFirst({
          where: { studentId: studentProfile.id, courseId: BigInt(quiz.lesson.courseId), status: 'ACTIVE' },
        });

        if (!enrollment || !quiz.isPublished) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لهذا الاختبار');
        }
      }

      return ApiResponse.success(res, 200, 'تم جلب تفاصيل الاختبار بنجاح', quiz);
    } catch (error) {
      next(error);
    }
  }

  static async createQuiz(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyLessonAccess(req.user.userId, req.body.lessonId, req.user.role);
      }
      const quiz = await QuizService.createQuiz(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء الاختبار بنجاح', quiz);
    } catch (error) {
      next(error);
    }
  }

  static async updateQuiz(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyQuizAccess(req.user.userId, req.params.id, req.user.role);
      }
      const quiz = await QuizService.updateQuiz(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث الاختبار بنجاح', quiz);
    } catch (error) {
      next(error);
    }
  }

  static async deleteQuiz(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyQuizAccess(req.user.userId, req.params.id, req.user.role);
      }
      const result = await QuizService.deleteQuiz(req.params.id);
      return ApiResponse.success(res, 200, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  static async deleteQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const question = await prisma.quizQuestion.findUnique({
        where: { id: BigInt(req.params.id) },
        select: { quizId: true },
      });
      if (!question) throw ApiError.notFound('السؤال غير موجود');

      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyQuizAccess(req.user.userId, question.quizId.toString(), req.user.role);
      }
      const result = await QuizService.deleteQuestion(req.params.id);
      return ApiResponse.success(res, 200, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  // 2. QUESTION CONTROLLERS
  static async addQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyQuizAccess(req.user.userId, req.body.quizId, req.user.role);
      }
      const question = await QuizService.addQuestion(req.body);
      return ApiResponse.success(res, 201, 'تم إضافة السؤال بنجاح', question);
    } catch (error) {
      next(error);
    }
  }

  static async updateQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const question = await prisma.quizQuestion.findUnique({
        where: { id: BigInt(req.params.id) },
        select: { quizId: true },
      });
      if (!question) throw ApiError.notFound('السؤال غير موجود');

      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyQuizAccess(req.user.userId, question.quizId.toString(), req.user.role);
      }
      const updated = await QuizService.updateQuestion(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث السؤال بنجاح', updated);
    } catch (error) {
      next(error);
    }
  }

  static async reorderQuestions(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyQuizAccess(req.user.userId, req.params.quizId, req.user.role);
      }
      const quiz = await QuizService.reorderQuestions(req.params.quizId, req.body);
      return ApiResponse.success(res, 200, 'تم إعادة ترتيب الأسئلة بنجاح', quiz);
    } catch (error) {
      next(error);
    }
  }

  // 3. STUDENT ATTEMPT & SUBMISSION CONTROLLERS
  static async startAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role !== 'student') throw ApiError.forbidden('فقط الطلاب يمكنهم بدء محاولة اختبار');

      const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
      if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

      const data = await QuizService.startAttempt(req.params.quizId, studentProfile.id.toString());
      return ApiResponse.success(res, 201, 'تم بدء محاولة الاختبار بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  static async submitAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role !== 'student') throw ApiError.forbidden('فقط الطلاب يمكنهم تسليم الإجابات');

      const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
      if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

      const result = await QuizService.submitAttempt(req.params.attemptId, studentProfile.id.toString(), req.body);
      return ApiResponse.success(res, 200, 'تم تسليم الاختبار وتصحيحه بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  static async getStudentAttempts(req: Request, res: Response, next: NextFunction) {
    try {
      let studentId = req.params.studentId;

      if (req.user?.role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!studentProfile || studentProfile.id.toString() !== studentId) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لمحاولات طالب آخر');
        }
      }

      if (req.user?.role === 'parent') {
        const parentProfile = await prisma.parent.findUnique({ where: { userId: BigInt(req.user.userId) } });
        const studentProfile = await prisma.student.findUnique({ where: { id: BigInt(studentId) } });
        if (!parentProfile || !studentProfile || studentProfile.parentId?.toString() !== parentProfile.id.toString()) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لنتائج طالب غير مرتبط بحسابك');
        }
      }

      const attempts = await QuizService.getStudentAttempts(req.params.quizId, studentId);
      return ApiResponse.success(res, 200, 'تم جلب محاولات الطالب بنجاح', attempts);
    } catch (error) {
      next(error);
    }
  }
}
