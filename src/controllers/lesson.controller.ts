import { Request, Response, NextFunction } from 'express';
import { LessonService } from '../services/lesson.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { prisma } from '../config/database';

export class LessonController {
  // 1. LESSON MANAGEMENT CONTROLLERS
  static async getLessonsByCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const courseId = req.params.courseId;

      // Student Security Boundary: Can only view published lessons of actively enrolled course
      if (req.user?.role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

        const enrollment = await prisma.enrollment.findFirst({
          where: { studentId: studentProfile.id, courseId: BigInt(courseId), status: 'ACTIVE' },
        });
        if (!enrollment) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لدروس كورس غير مشترك فيه');
        }

        const lessons = await LessonService.getLessonsByCourse(courseId, true); // Published only!
        return ApiResponse.success(res, 200, 'تم جلب دروس الكورس بنجاح', lessons);
      }

      // Teacher Security Boundary Check
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyCourseAccess(req.user.userId, courseId, req.user.role);
      }

      const lessons = await LessonService.getLessonsByCourse(courseId, false);
      return ApiResponse.success(res, 200, 'تم جلب دروس الكورس بنجاح', lessons);
    } catch (error) {
      next(error);
    }
  }

  static async getLessonById(req: Request, res: Response, next: NextFunction) {
    try {
      const lesson = await LessonService.getLessonById(req.params.id);

      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyCourseAccess(req.user.userId, lesson.courseId.toString(), req.user.role);
      }

      // Student Security Boundary Check
      if (req.user?.role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

        const enrollment = await prisma.enrollment.findFirst({
          where: { studentId: studentProfile.id, courseId: BigInt(String(lesson.courseId)), status: 'ACTIVE' },
        });

        if (!enrollment || !lesson.isPublished) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لهذا الدرس');
        }
      }

      return ApiResponse.success(res, 200, 'تم جلب تفاصيل الدرس بنجاح', lesson);
    } catch (error) {
      next(error);
    }
  }

  static async createLesson(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyCourseAccess(req.user.userId, req.body.courseId, req.user.role);
      }
      const lesson = await LessonService.createLesson(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء الدرس بنجاح', lesson);
    } catch (error) {
      next(error);
    }
  }

  static async updateLesson(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyLessonAccess(req.user.userId, req.params.id, req.user.role);
      }
      const lesson = await LessonService.updateLesson(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث الدرس بنجاح', lesson);
    } catch (error) {
      next(error);
    }
  }

  static async reorderLessons(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyCourseAccess(req.user.userId, req.params.courseId, req.user.role);
      }
      const lessons = await LessonService.reorderLessons(req.params.courseId, req.body);
      return ApiResponse.success(res, 200, 'تم إعادة ترتيب الدروس بنجاح', lessons);
    } catch (error) {
      next(error);
    }
  }

  // 2. VIDEO UPLOAD CONTROLLERS
  static async requestVideoUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyLessonAccess(req.user.userId, req.params.lessonId, req.user.role);
      }
      const result = await LessonService.requestVideoUploadUrl(req.params.lessonId, req.body);
      return ApiResponse.success(res, 200, 'تم توليد رابط رفع الفيديو الرأسي بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  static async completeVideoUpload(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyLessonAccess(req.user.userId, req.params.lessonId, req.user.role);
      }
      const video = await LessonService.completeVideoUpload(req.params.lessonId, req.body);
      return ApiResponse.success(res, 201, 'تم تسجيل بيانات الفيديو بنجاح', video);
    } catch (error) {
      next(error);
    }
  }

  // 3. SECURE VIDEO ACCESS CONTROLLER
  static async getSecureVideoAccess(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const result = await LessonService.getSecureVideoAccess(req.params.videoId, req.user.userId.toString(), req.user.role);
      return ApiResponse.success(res, 200, 'تم توليد رابط مشاهدة الفيديو المؤقت بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  // 4. STUDENT PROGRESS CONTROLLERS
  static async getStudentProgress(req: Request, res: Response, next: NextFunction) {
    try {
      let studentId = req.params.studentId;

      if (req.user?.role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!studentProfile || studentProfile.id.toString() !== studentId) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لتقدم طالب آخر');
        }
      }

      const progress = await LessonService.getStudentProgress(studentId, req.params.lessonId);
      return ApiResponse.success(res, 200, 'تم جلب تقدم الطالب في الدرس بنجاح', progress);
    } catch (error) {
      next(error);
    }
  }

  static async updateStudentProgress(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role !== 'student') {
        throw ApiError.forbidden('فقط الطلاب يمكنهم تحديث تقدم مشاهدة الدروس');
      }

      const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
      if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

      const progress = await LessonService.updateStudentProgress(studentProfile.id.toString(), req.params.lessonId, req.body);
      return ApiResponse.success(res, 200, 'تم حفظ تقدم مشاهدة الفيديو بنجاح', progress);
    } catch (error) {
      next(error);
    }
  }
}
