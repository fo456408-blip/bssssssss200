import { Request, Response, NextFunction } from 'express';
import { AssignmentService } from '../services/assignment.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { prisma } from '../config/database';

export class AssignmentController {
  // 1. ASSIGNMENT MANAGEMENT CONTROLLERS
  static async getAssignmentsByLesson(req: Request, res: Response, next: NextFunction) {
    try {
      const lessonId = req.params.lessonId;
      const role = req.user?.role?.toLowerCase();

      if (role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user!.userId) } });
        if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

        const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(lessonId) } });
        if (!lesson || !lesson.isPublished) throw ApiError.forbidden('الدرس غير متاح');

        const enrollment = await prisma.enrollment.findFirst({
          where: { studentId: studentProfile.id, courseId: lesson.courseId, status: 'ACTIVE' },
        });
        if (!enrollment) throw ApiError.forbidden('غير مصرح لك بالوصول لواجبات كورس غير مشترك فيه');

        const assignments = await AssignmentService.getAssignmentsByLesson(lessonId, true);
        return ApiResponse.success(res, 200, 'تم جلب واجبات الدرس بنجاح', assignments);
      }

      if (role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyLessonAccess(req.user!.userId, lessonId, req.user!.role);
      }

      const assignments = await AssignmentService.getAssignmentsByLesson(lessonId, false);
      return ApiResponse.success(res, 200, 'تم جلب واجبات الدرس بنجاح', assignments);
    } catch (error) {
      next(error);
    }
  }

  static async getAssignmentById(req: Request, res: Response, next: NextFunction) {
    try {
      const assignment = await AssignmentService.getAssignmentById(req.params.id);
      const role = req.user?.role?.toLowerCase();

      if (role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyAssignmentAccess(req.user!.userId, req.params.id, req.user!.role);
      }

      if (role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user!.userId) } });
        if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

        const enrollment = await prisma.enrollment.findFirst({
          where: { studentId: studentProfile.id, courseId: BigInt(assignment.lesson.courseId), status: 'ACTIVE' },
        });

        if (!enrollment || !assignment.isPublished) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لهذا الواجب');
        }
      }

      return ApiResponse.success(res, 200, 'تم جلب تفاصيل الواجب بنجاح', assignment);
    } catch (error) {
      next(error);
    }
  }

  static async createAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const role = req.user?.role?.toLowerCase();
      if (role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyLessonAccess(req.user!.userId, req.body.lessonId, req.user!.role);
      }
      const assignment = await AssignmentService.createAssignment(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء الواجب بنجاح', assignment);
    } catch (error) {
      next(error);
    }
  }

  static async updateAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const role = req.user?.role?.toLowerCase();
      if (role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyAssignmentAccess(req.user!.userId, req.params.id, req.user!.role);
      }
      const assignment = await AssignmentService.updateAssignment(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث الواجب بنجاح', assignment);
    } catch (error) {
      next(error);
    }
  }

  static async deleteAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const role = req.user?.role?.toLowerCase();
      if (role === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        await TeacherService.verifyAssignmentAccess(req.user!.userId, req.params.id, req.user!.role);
      }
      const result = await AssignmentService.deleteAssignment(req.params.id);
      return ApiResponse.success(res, 200, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  // 2. STUDENT R2 SUBMISSION FLOW
  static async getUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const role = req.user?.role?.toLowerCase();
      if (role !== 'student') throw ApiError.forbidden('فقط الطلاب يمكنهم طلب رابط رفع الواجبات');

      const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user!.userId) } });
      if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

      const result = await AssignmentService.getUploadUrl(
        req.params.assignmentId,
        studentProfile.id.toString(),
        req.body
      );
      return ApiResponse.success(res, 200, 'تم التثبت وإنشاء رابط الرفع المؤقت بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  static async completeR2Submission(req: Request, res: Response, next: NextFunction) {
    try {
      const role = req.user?.role?.toLowerCase();
      if (role !== 'student') throw ApiError.forbidden('فقط الطلاب يمكنهم تأكيد تسليم الواجبات');

      const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user!.userId) } });
      if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

      const submission = await AssignmentService.completeR2Submission(
        req.params.assignmentId,
        studentProfile.id.toString(),
        req.body
      );
      return ApiResponse.success(res, 201, 'تم تأكيد وحفظ تسليم الواجب بنجاح', submission);
    } catch (error) {
      next(error);
    }
  }

  static async submitAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const role = req.user?.role?.toLowerCase();
      if (role !== 'student') throw ApiError.forbidden('فقط الطلاب يمكنهم تسليم الواجبات');

      const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user!.userId) } });
      if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

      const submission = await AssignmentService.submitAssignment(req.params.id, studentProfile.id.toString(), req.body);
      return ApiResponse.success(res, 201, 'تم تسليم الواجب بنجاح', submission);
    } catch (error) {
      next(error);
    }
  }

  static async getStudentSubmission(req: Request, res: Response, next: NextFunction) {
    try {
      let studentId = req.params.studentId;
      const role = req.user?.role?.toLowerCase();

      if (role === 'student') {
        const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(req.user!.userId) } });
        if (!studentProfile || studentProfile.id.toString() !== studentId) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لتسليم طالب آخر');
        }
      }

      if (role === 'parent') {
        const parentProfile = await prisma.parent.findUnique({ where: { userId: BigInt(req.user!.userId) } });
        const studentProfile = await prisma.student.findUnique({ where: { id: BigInt(studentId) } });
        if (!parentProfile || !studentProfile || studentProfile.parentId?.toString() !== parentProfile.id.toString()) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لواجبات طالب غير مرتبط بحسابك');
        }
      }

      const submission = await AssignmentService.getStudentSubmission(req.params.id, studentId);
      return ApiResponse.success(res, 200, 'تم جلب تسليم الواجب بنجاح', submission);
    } catch (error) {
      next(error);
    }
  }

  // 3. SECURE SUBMISSION FILE ACCESS CONTROLLER
  static async getSubmissionFile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');

      const user = { userId: BigInt(req.user.userId), role: req.user.role.toLowerCase() };
      const fileData = await AssignmentService.getSubmissionFileUrl(req.params.submissionId, user);
      return ApiResponse.success(res, 200, 'تم إنشاء رابط التحميل الآمن للملف بنجاح', fileData);
    } catch (error) {
      next(error);
    }
  }

  // 4. TEACHER GRADING CONTROLLERS
  static async gradeSubmission(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const graded = await AssignmentService.gradeSubmission(req.params.submissionId, req.user.userId.toString(), req.body);
      return ApiResponse.success(res, 200, 'تم تقييم الواجب ورصد الدرجة والملاحظات بنجاح', graded);
    } catch (error) {
      next(error);
    }
  }

  static async getSubmissionsForAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const assignmentId = req.params.id;
      const role = req.user?.role?.toLowerCase();

      if (role === 'teacher') {
        const teacherProfile = await prisma.teacher.findUnique({ where: { userId: BigInt(req.user!.userId) } });
        if (!teacherProfile) throw ApiError.forbidden('ملف المعلم غير موجود');

        const assignment = await prisma.assignment.findUnique({
          where: { id: BigInt(assignmentId) },
          include: { lesson: true },
        });
        if (!assignment) throw ApiError.notFound('الواجب غير موجود');

        const isAssigned = await prisma.teacherCourse.findFirst({
          where: { teacherId: teacherProfile.id, courseId: assignment.lesson.courseId },
        });
        if (!isAssigned) {
          throw ApiError.forbidden('غير مصرح لك بالوصول لتسليمات واجب كورس غير مسند إليك');
        }
      }

      const submissions = await AssignmentService.getSubmissionsForAssignment(assignmentId);
      return ApiResponse.success(res, 200, 'تم جلب جميع تسليمات الطلاب بنجاح', submissions);
    } catch (error) {
      next(error);
    }
  }
}
