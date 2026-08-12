import { Request, Response, NextFunction } from 'express';
import { OperationsService } from '../services/operations.service';
import { paginationSchema } from '../validators/admin.validator';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { prisma } from '../config/database';

export class OperationsController {
  // 1. CLASS SESSIONS CONTROLLERS
  static async getSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, status } = paginationSchema.parse(req.query);
      const groupId = req.query.groupId as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      // Teacher Security Guard: Can only view sessions belonging to their assigned groups
      let teacherUserId: string | undefined = undefined;
      if (req.user?.role === 'teacher') {
        teacherUserId = req.user.userId.toString();
        if (groupId) {
          const { TeacherService } = await import('../services/teacher.service');
          await TeacherService.verifyGroupAccess(req.user.userId, groupId, req.user.role);
        }
      }

      const result = await OperationsService.getSessions(page, limit, groupId, startDate, endDate, status, teacherUserId);
      return ApiResponse.success(res, 200, 'تم جلب الحصص بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async getSessionById(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifySessionAccess(req.user.userId, req.params.id, req.user.role);
      }
      const session = await OperationsService.getSessionById(req.params.id);
      return ApiResponse.success(res, 200, 'تم جلب بيانات الحصة بنجاح', session);
    } catch (error) {
      next(error);
    }
  }

  static async createSession(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyGroupAccess(req.user.userId, req.body.groupId, req.user.role);
      }
      const session = await OperationsService.createSession(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء الحصة بنجاح', session);
    } catch (error) {
      next(error);
    }
  }

  static async updateSession(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await OperationsService.updateSession(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث بيانات الحصة بنجاح', session);
    } catch (error) {
      next(error);
    }
  }

  // 2. ATTENDANCE CONTROLLERS
  static async getAttendanceSheet(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = req.params.sessionId;

      // Teacher Security Check
      if (req.user?.role === 'teacher') {
        const session = await prisma.classSession.findUnique({
          where: { id: BigInt(sessionId) },
          include: { group: true },
        });
        if (!session) throw ApiError.notFound('الحصة غير موجودة');

        const teacherProfile = await prisma.teacher.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!teacherProfile) throw ApiError.forbidden('ملف المعلم غير موجود');

        const isAssigned = await prisma.teacherCourse.findFirst({
          where: { teacherId: teacherProfile.id, courseId: session.group.courseId },
        });
        if (!isAssigned) {
          throw ApiError.forbidden('غير مصرح لك بفتح كشف حضور مجموعة غير مسندة إليك');
        }
      }

      const sheet = await OperationsService.getAttendanceSheet(sessionId);
      return ApiResponse.success(res, 200, 'تم جلب كشف الحضور بنجاح', sheet);
    } catch (error) {
      next(error);
    }
  }

  static async saveAttendanceSheet(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = req.params.sessionId;

      // Teacher Security Check
      if (req.user?.role === 'teacher') {
        const session = await prisma.classSession.findUnique({
          where: { id: BigInt(sessionId) },
          include: { group: true },
        });
        if (!session) throw ApiError.notFound('الحصة غير موجودة');

        const teacherProfile = await prisma.teacher.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!teacherProfile) throw ApiError.forbidden('ملف المعلم غير موجود');

        const isAssigned = await prisma.teacherCourse.findFirst({
          where: { teacherId: teacherProfile.id, courseId: session.group.courseId },
        });
        if (!isAssigned) {
          throw ApiError.forbidden('غير مصرح لك بتسجيل حضور مجموعة غير مسندة إليك');
        }
      }

      const result = await OperationsService.saveAttendanceSheet(sessionId, req.body);
      return ApiResponse.success(res, 200, 'تم تسجيل كشف الحضور والغياب بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  static async getStudentAttendanceStats(req: Request, res: Response, next: NextFunction) {
    try {
      const targetStudentId = req.params.studentId;

      // Security Boundary Enforcement:
      // STUDENT role can only request their OWN student ID
      if (req.user?.role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!studentProfile || studentProfile.id.toString() !== targetStudentId) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لإحصائيات حضور طالب آخر');
        }
      }

      // PARENT role can only request their OWN linked children
      if (req.user?.role === 'parent') {
        const parentProfile = await prisma.parent.findUnique({ where: { userId: BigInt(req.user.userId) } });
        const student = await prisma.student.findUnique({ where: { id: BigInt(targetStudentId) } });
        if (!parentProfile || !student || student.parentId !== parentProfile.id) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لسجل حضور طالب غير مرتبط بحسابك');
        }
      }

      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const stats = await OperationsService.calculateStudentAttendanceStats(targetStudentId, startDate, endDate);
      return ApiResponse.success(res, 200, 'تم حساب إحصائيات الحضور بنجاح', stats);
    } catch (error) {
      next(error);
    }
  }

  // 3. PAYMENT CONTROLLERS
  static async getPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, status } = paginationSchema.parse(req.query);
      let studentId = req.query.studentId as string | undefined;
      const courseId = req.query.courseId as string | undefined;
      const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
      const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
      const paymentMethod = req.query.paymentMethod as string | undefined;

      // Role Access Enforcement for Financial Data:
      if (req.user?.role === 'teacher') {
        throw ApiError.forbidden('غير مصرح للمعلمين بالوصول للبيانات المالية والمصروفات');
      }

      if (req.user?.role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');
        studentId = studentProfile.id.toString(); // Scope strictly to current student
      }

      if (req.user?.role === 'parent') {
        const parentProfile = await prisma.parent.findUnique({ where: { userId: BigInt(req.user.userId) } });
        if (!parentProfile) throw ApiError.forbidden('ملف ولي الأمر غير موجود');
        if (studentId) {
          const student = await prisma.student.findUnique({ where: { id: BigInt(studentId) } });
          if (!student || student.parentId !== parentProfile.id) {
            throw ApiError.forbidden('غير مصرح لك بالوصول لمدفوعات طالب غير مرتبط بحسابك');
          }
        }
      }

      const result = await OperationsService.getPayments(page, limit, studentId, courseId, month, year, status, paymentMethod);
      return ApiResponse.success(res, 200, 'تم جلب مدفوعات المصروفات بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async recordPayment(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role !== 'admin') {
        throw ApiError.forbidden('فقط مدير النظام يمكنه تسجيل المدفوعات والمصروفات');
      }
      const payment = await OperationsService.recordPayment(req.body);
      return ApiResponse.success(res, 201, 'تم تسجيل دفع المصروفات بنجاح', payment);
    } catch (error) {
      next(error);
    }
  }

  static async updatePayment(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.role !== 'admin') {
        throw ApiError.forbidden('فقط مدير النظام يمكنه تعديل المدفوعات والمصروفات');
      }
      const payment = await OperationsService.updatePayment(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث بيانات الدفعة بنجاح', payment);
    } catch (error) {
      next(error);
    }
  }

  static async getReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const receipt = await OperationsService.generateReceipt(req.params.id);
      return ApiResponse.success(res, 200, 'تم توليد بيانات إيصال السداد بنجاح', receipt);
    } catch (error) {
      next(error);
    }
  }
}
