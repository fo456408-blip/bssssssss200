import { Request, Response, NextFunction } from 'express';
import { AnnouncementService } from '../services/announcement.service';
import { AuditLogService } from '../services/audit-log.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class AnnouncementController {
  // POST /api/v1/announcements (Admin only)
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { title, content, targetAudience, courseId, status, expiresAt } = req.body;

      if (!title || !content || !targetAudience) {
        throw ApiError.badRequest('العنوان والمحتوى والجهة المستهدفة مطلوبة');
      }

      if (req.user.role.toLowerCase() === 'teacher') {
        const { TeacherService } = await import('../services/teacher.service');
        if (!courseId) {
          throw ApiError.badRequest('يجب اختيار كورس مسند لإرسال التنبيه له');
        }
        await TeacherService.verifyCourseAccess(req.user.userId, courseId, req.user.role);
        if (targetAudience !== 'COURSE_STUDENTS' && targetAudience !== 'COURSE_PARENTS') {
          throw ApiError.badRequest('المعلم يمكنه إرسال الإعلانات فقط لطلاب الكورس المسند له أو أولياء أمورهم');
        }
      }

      const announcement = await AnnouncementService.createAnnouncement(req.user.userId.toString(), {
        title,
        content,
        targetAudience,
        courseId,
        status,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      await AuditLogService.logAction(
        { userId: BigInt(req.user.userId), role: req.user.role.toUpperCase() as any },
        'CREATE_ANNOUNCEMENT',
        'ANNOUNCEMENT',
        announcement.id.toString(),
        null,
        { title, targetAudience, status: announcement.status },
        { title },
        req.ip
      );

      return ApiResponse.success(res, 201, 'تم إنشاء الإعلان بنجاح', {
        id: announcement.id.toString(),
        title: announcement.title,
        targetAudience: announcement.targetAudience,
        status: announcement.status,
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/announcements/:id/publish (Admin only)
  static async publish(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const announcement = await AnnouncementService.publishAnnouncement(req.user.userId.toString(), req.params.id);

      await AuditLogService.logAction(
        { userId: BigInt(req.user.userId), role: req.user.role.toUpperCase() as any },
        'PUBLISH_ANNOUNCEMENT',
        'ANNOUNCEMENT',
        announcement.id.toString(),
        { status: 'DRAFT' },
        { status: 'PUBLISHED' },
        { title: announcement.title },
        req.ip
      );

      return ApiResponse.success(res, 200, 'تم نشر الإعلان وإرسال التنبيهات بنجاح', {
        id: announcement.id.toString(),
        status: announcement.status,
        publishedAt: announcement.publishedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/admin/announcements/:id (Admin only)
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const { title, content, targetAudience, courseId, expiresAt } = req.body;

      const updated = await AnnouncementService.updateAnnouncement(req.params.id, {
        title,
        content,
        targetAudience,
        courseId,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      await AuditLogService.logAction(
        { userId: BigInt(req.user.userId), role: req.user.role.toUpperCase() as any },
        'UPDATE_ANNOUNCEMENT',
        'ANNOUNCEMENT',
        updated.id.toString(),
        null,
        { title: updated.title, targetAudience: updated.targetAudience },
        { title: updated.title },
        req.ip
      );

      return ApiResponse.success(res, 200, 'تم تحديث الإعلان بنجاح', {
        id: updated.id.toString(),
        title: updated.title,
        content: updated.content,
        targetAudience: updated.targetAudience,
        status: updated.status,
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/announcements (User active announcements)
  static async getForUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const list = await AnnouncementService.getAnnouncementsForUser(
        req.user.userId.toString(),
        req.user.role.toUpperCase() as any
      );
      return ApiResponse.success(res, 200, 'تم جلب الإعلانات بنجاح', list);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/admin/announcements (Admin/Teacher overview)
  static async getAdminAnnouncements(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const list = await AnnouncementService.getAdminAnnouncements(req.user.userId.toString(), req.user.role);
      return ApiResponse.success(res, 200, 'تم جلب قائمة الإعلانات الإدارية بنجاح', list);
    } catch (error) {
      next(error);
    }
  }
}
