import { Request, Response, NextFunction } from 'express';
import { TeacherService } from '../services/teacher.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class TeacherController {
  // GET /api/v1/teacher/courses
  static async getCourses(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const courses = await TeacherService.getTeacherCourses(req.user.userId);
      return ApiResponse.success(res, 200, 'تم جلب الكورسات المسندة بنجاح', courses);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/teacher/groups
  static async getGroups(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const groups = await TeacherService.getTeacherGroups(req.user.userId);
      return ApiResponse.success(res, 200, 'تم جلب المجموعات المسندة بنجاح', groups);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/teacher/students
  static async getStudents(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const search = req.query.search as string | undefined;
      const students = await TeacherService.getTeacherStudents(req.user.userId, search);
      return ApiResponse.success(res, 200, 'تم جلب قائمة الطلاب بنجاح', students);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/teacher/dashboard
  static async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const stats = await TeacherService.getTeacherDashboardStats(req.user.userId);
      return ApiResponse.success(res, 200, 'تم جلب احصائيات المحاضر بنجاح', stats);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/teacher/groups
  static async createGroup(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const group = await TeacherService.createTeacherGroup(req.user.userId, req.user.role, req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء المجموعة بنجاح', group);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/teacher/groups/:id
  static async updateGroup(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const group = await TeacherService.updateTeacherGroup(req.user.userId, req.user.role, req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث بيانات المجموعة بنجاح', group);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v1/teacher/groups/:id
  static async deleteGroup(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const result = await TeacherService.deleteTeacherGroup(req.user.userId, req.user.role, req.params.id);
      return ApiResponse.success(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/teacher/groups/:id/students
  static async getGroupStudents(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const students = await TeacherService.getGroupStudents(req.user.userId, req.user.role, req.params.id);
      return ApiResponse.success(res, 200, 'تم جلب طلاب المجموعة بنجاح', students);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/teacher/groups/:id/students
  static async addStudentToGroup(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { studentId } = req.body;
      const result = await TeacherService.addStudentToGroup(req.user.userId, req.user.role, req.params.id, studentId);
      return ApiResponse.success(res, 201, 'تم إضافة الطالب للمجموعة بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v1/teacher/groups/:id/students/:studentId
  static async removeStudentFromGroup(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const result = await TeacherService.removeStudentFromGroup(req.user.userId, req.user.role, req.params.id, req.params.studentId);
      return ApiResponse.success(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  }
}
