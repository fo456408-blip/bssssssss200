import { Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class ReportController {
  // 1. ADMIN GENERATE MONTHLY REPORT (POST /admin/reports/students/:studentId/monthly)
  static async generateMonthlyReport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { studentId } = req.params;
      const { year, month } = req.body;

      if (!year || !month) {
        throw ApiError.badRequest('يرجى تحديد السنة والشهر المطلوبة للتقرير');
      }

      const report = await ReportService.generateMonthlyReport(
        studentId,
        Number(year),
        Number(month),
        req.user.userId.toString()
      );

      return ApiResponse.success(res, 201, 'تم إنشاء التقرير الشهري وحفظ ملف PDF بنجاح', report);
    } catch (error) {
      next(error);
    }
  }

  // 2. ADMIN GET REPORTS SEARCH & LIST (GET /admin/reports)
  static async getAdminReports(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const studentId = req.query.studentId as string | undefined;
      const month = req.query.month ? Number(req.query.month) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;

      const result = await ReportService.getAdminReports(page, limit, studentId, month, year);
      return ApiResponse.success(res, 200, 'تم جلب تقارير الطلاب بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  // 3. STUDENT GET OWN REPORTS (GET /student/reports)
  static async getStudentReports(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const list = await ReportService.getReportsForStudent(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب التقارير الشهرية بنجاح', list);
    } catch (error) {
      next(error);
    }
  }

  // 3B. STUDENT GENERATE OWN MONTHLY REPORT (POST /student/reports/monthly)
  static async generateStudentMonthlyReport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { year, month } = req.body;

      if (!year || !month) {
        throw ApiError.badRequest('يرجى تحديد السنة والشهر المطلوبة للتقرير');
      }

      const report = await ReportService.generateStudentMonthlyReport(
        req.user.userId.toString(),
        Number(year),
        Number(month)
      );

      return ApiResponse.success(res, 201, 'تم إنشاء التقرير الشهري بنجاح', report);
    } catch (error) {
      next(error);
    }
  }

  // 4. PARENT GET LINKED CHILD REPORTS (GET /parent/children/:childId/reports)
  static async getParentChildReports(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { childId } = req.params;
      const list = await ReportService.getReportsForParent(req.user.userId.toString(), childId);
      return ApiResponse.success(res, 200, 'تم جلب تقارير الطالب بنجاح', list);
    } catch (error) {
      next(error);
    }
  }

  // 4B. PARENT GENERATE / REQUEST MONTHLY REPORT FOR LINKED CHILD (POST /parent/children/:childId/reports/monthly)
  static async generateParentChildMonthlyReport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { childId } = req.params;
      const { year, month } = req.body;

      if (!year || !month) {
        throw ApiError.badRequest('يرجى تحديد السنة والشهر المطلوبة للتقرير');
      }

      const report = await ReportService.generateParentChildMonthlyReport(
        req.user.userId.toString(),
        childId,
        Number(year),
        Number(month)
      );

      return ApiResponse.success(res, 201, 'تم إنشاء التقرير الشهري بنجاح', report);
    } catch (error) {
      next(error);
    }
  }

  // 5. TEACHER GET AUTHORIZED STUDENT REPORTS (GET /teacher/students/:studentId/reports)
  static async getTeacherStudentReports(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { studentId } = req.params;
      const list = await ReportService.getReportsForTeacher(req.user.userId.toString(), studentId);
      return ApiResponse.success(res, 200, 'تم جلب تقارير الطالب بنجاح', list);
    } catch (error) {
      next(error);
    }
  }

  // 5B. TEACHER GENERATE MONTHLY REPORT FOR ASSIGNED STUDENT (POST /teacher/students/:studentId/reports/monthly)
  static async generateTeacherStudentMonthlyReport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { studentId } = req.params;
      const { year, month } = req.body;

      if (!year || !month) {
        throw ApiError.badRequest('يرجى تحديد السنة والشهر المطلوبة للتقرير');
      }

      const report = await ReportService.generateTeacherStudentMonthlyReport(
        req.user.userId.toString(),
        studentId,
        Number(year),
        Number(month)
      );

      return ApiResponse.success(res, 201, 'تم إنشاء التقرير الشهري بنجاح', report);
    } catch (error) {
      next(error);
    }
  }

  // 6. GET SECURE SIGNED URL FOR REPORT PDF (GET /reports/:reportId/pdf)
  static async getReportSignedUrl(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { reportId } = req.params;

      const result = await ReportService.getReportSignedUrl(
        reportId,
        req.user.userId.toString(),
        req.user.role
      );

      return ApiResponse.success(res, 200, 'تم إنشاء رابط التقرير الآمن بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  // 7. STREAM REPORT PDF FILE DIRECTLY (GET /reports/:reportId/download)
  static async downloadReportPDF(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { reportId } = req.params;

      const { pdfBuffer, filename } = await ReportService.streamReportPDFBuffer(
        reportId,
        req.user.userId.toString(),
        req.user.role
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}
