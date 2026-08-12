import { Request, Response, NextFunction } from 'express';
import { StudentDashboardService } from '../services/student-dashboard.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class StudentDashboardController {
  // 1. GET DASHBOARD SUMMARY
  static async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const data = await StudentDashboardService.getStudentDashboard(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب بيانات لوحة تحكم الطالب بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  // 2. GET STUDENT PROFILE
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const student = await StudentDashboardService.getStudentByUserId(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب ملف الطالب بنجاح', {
        id: student.id.toString(),
        fullName: student.user.fullName,
        username: student.user.username,
        phone: student.user.phone,
        email: student.user.email,
        grade: student.grade,
        schoolName: student.schoolName,
        parentName: student.parent?.user?.fullName || null,
        parentPhone: student.parent?.user?.phone || null,
      });
    } catch (error) {
      next(error);
    }
  }

  // 3. GET STUDENT ENROLLED COURSES
  static async getCourses(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const courses = await StudentDashboardService.getStudentCourses(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب كورسات الطالب بنجاح', courses);
    } catch (error) {
      next(error);
    }
  }

  // 4. GET COURSE DETAILS WITH ORDERED LESSONS
  static async getCourseDetails(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const data = await StudentDashboardService.getStudentCourseDetails(
        req.user.userId.toString(),
        req.params.courseId
      );
      return ApiResponse.success(res, 200, 'تم جلب تفاصيل الكورس بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  // 5. GET ATTENDANCE SUMMARY & RECORDS
  static async getAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const student = await StudentDashboardService.getStudentByUserId(req.user.userId.toString());
      const data = await StudentDashboardService.getStudentAttendanceSummary(student.id);
      return ApiResponse.success(res, 200, 'تم جلب سجل حضور الطالب بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  // 6. GET PAYMENT SUMMARY & HISTORY
  static async getPayments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const student = await StudentDashboardService.getStudentByUserId(req.user.userId.toString());
      const data = await StudentDashboardService.getStudentPaymentSummary(student.id);
      return ApiResponse.success(res, 200, 'تم جلب سجل مدفوعات الطالب بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  // 7. GET QUIZ STATISTICS & LIST
  static async getQuizzes(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const student = await StudentDashboardService.getStudentByUserId(req.user.userId.toString());
      const data = await StudentDashboardService.getStudentQuizStatistics(student.id);
      return ApiResponse.success(res, 200, 'تم جلب قائمة اختبارات الطالب بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  // 8. GET ASSIGNMENT STATISTICS & LIST
  static async getAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const student = await StudentDashboardService.getStudentByUserId(req.user.userId.toString());
      const data = await StudentDashboardService.getStudentAssignmentStatistics(student.id);
      return ApiResponse.success(res, 200, 'تم جلب قائمة واجبات الطالب بنجاح', data);
    } catch (error) {
      next(error);
    }
  }

  // 9. GET RECENT ACTIVITY FEED
  static async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const student = await StudentDashboardService.getStudentByUserId(req.user.userId.toString());
      const activity = await StudentDashboardService.getRecentActivity(student.id);
      return ApiResponse.success(res, 200, 'تم جلب النشاطات الأخيرة بنجاح', activity);
    } catch (error) {
      next(error);
    }
  }
}
