import { Request, Response, NextFunction } from 'express';
import { ParentDashboardService } from '../services/parent-dashboard.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class ParentDashboardController {
  // 1. GET PARENT DASHBOARD
  static async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const data = await ParentDashboardService.getParentDashboard(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب بيانات لوحة تحكم ولي الأمر بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  // 2. GET PARENT PROFILE
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const parent = await ParentDashboardService.getParentByUserId(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب ملف ولي الأمر بنجاح', {
        id: parent.id.toString(),
        fullName: parent.user.fullName,
        username: parent.user.username,
        phone: parent.user.phone,
        email: parent.user.email,
        occupation: parent.occupation,
        childrenCount: parent.students.length,
      });
    } catch (error) {
      next(error);
    }
  }

  // 3. GET LINKED CHILDREN LIST
  static async getChildren(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const children = await ParentDashboardService.getParentChildren(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب قائمة الأبناء بنجاح', children);
    } catch (error) {
      next(error);
    }
  }

  // 4. GET SPECIFIC CHILD OVERVIEW
  static async getChildOverview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const data = await ParentDashboardService.getChildOverview(
        req.user.userId.toString(),
        req.params.childId
      );
      return ApiResponse.success(res, 200, 'تم جلب بيانات الطالب بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  // 5. GET CHILD COURSES
  static async getChildCourses(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const courses = await ParentDashboardService.getChildCourses(
        req.user.userId.toString(),
        req.params.childId
      );
      return ApiResponse.success(res, 200, 'تم جلب كورسات الطالب بنجاح', courses);
    } catch (error) {
      next(error);
    }
  }

  // 6. GET CHILD COURSE DETAILS (Sanitized: Progress-only)
  static async getChildCourseDetails(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const details = await ParentDashboardService.getChildCourseDetails(
        req.user.userId.toString(),
        req.params.childId,
        req.params.courseId
      );
      return ApiResponse.success(res, 200, 'تم جلب تفاصيل كورس الطالب بنجاح', details);
    } catch (error) {
      next(error);
    }
  }

  // 7. GET CHILD ATTENDANCE
  static async getChildAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const attendance = await ParentDashboardService.getChildAttendance(
        req.user.userId.toString(),
        req.params.childId
      );
      return ApiResponse.success(res, 200, 'تم جلب سجل حضور الطالب بنجاح', attendance);
    } catch (error) {
      next(error);
    }
  }

  // 8. GET CHILD QUIZZES & RESULTS
  static async getChildQuizzes(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const quizzes = await ParentDashboardService.getChildQuizzes(
        req.user.userId.toString(),
        req.params.childId
      );
      return ApiResponse.success(res, 200, 'تم جلب نتائج اختبارات الطالب بنجاح', quizzes);
    } catch (error) {
      next(error);
    }
  }

  // 9. GET CHILD ASSIGNMENTS & TEACHER FEEDBACK
  static async getChildAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const assignments = await ParentDashboardService.getChildAssignments(
        req.user.userId.toString(),
        req.params.childId
      );
      return ApiResponse.success(res, 200, 'تم جلب واجبات وملاحظات معلم الطالب بنجاح', assignments);
    } catch (error) {
      next(error);
    }
  }

  // 10. GET CHILD PAYMENTS (READ-ONLY)
  static async getChildPayments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const payments = await ParentDashboardService.getChildPayments(
        req.user.userId.toString(),
        req.params.childId
      );
      return ApiResponse.success(res, 200, 'تم جلب سجل مصروفات الطالب بنجاح', payments);
    } catch (error) {
      next(error);
    }
  }

  // 11. GET PARENT RECENT ACTIVITY FEED
  static async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const activity = await ParentDashboardService.getParentRecentActivity(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب نشاطات الأبناء الأخيرة بنجاح', activity);
    } catch (error) {
      next(error);
    }
  }
}
