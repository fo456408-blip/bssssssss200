import { Request, Response, NextFunction } from 'express';
import { AuditLogService } from '../services/audit-log.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class AuditLogController {
  // GET /api/v1/admin/audit-logs (Admin only)
  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');

      const logs = await AuditLogService.getAuditLogs({
        actorId: req.query.actorId as string,
        action: req.query.action as string,
        entityType: req.query.entityType as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      });

      return ApiResponse.success(res, 200, 'تم جلب سجل العمليات بنجاح', logs);
    } catch (error) {
      next(error);
    }
  }

  // Reject POST /admin/audit-logs (Immutability Enforcement)
  static async rejectCreate(req: Request, res: Response, next: NextFunction) {
    return next(ApiError.forbidden('سجل العمليات غير قابل للإنشاء المباشر عبر API. التوثيق يتم تلقائياً فقط عبر أحداث النظام.'));
  }

  // Reject PATCH /admin/audit-logs/:id (Immutability Enforcement)
  static async rejectUpdate(req: Request, res: Response, next: NextFunction) {
    return next(ApiError.forbidden('سجل العمليات غير قابل للتعديل أو التحريف.'));
  }

  // Reject DELETE /admin/audit-logs/:id (Immutability Enforcement)
  static async rejectDelete(req: Request, res: Response, next: NextFunction) {
    return next(ApiError.forbidden('سجل العمليات غير قابل للحذف.'));
  }
}
