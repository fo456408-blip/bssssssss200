import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class NotificationController {
  // GET /api/v1/notifications
  static async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const unreadOnly = req.query.unread === 'true';
      const notifications = await NotificationService.getUserNotifications(req.user.userId.toString(), unreadOnly);
      const formatted = notifications.map((n) => ({
        id: n.id.toString(),
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        type: n.type,
        link: n.link,
        createdAt: n.createdAt,
      }));
      return ApiResponse.success(res, 200, 'تم جلب الإشعارات بنجاح', formatted);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/notifications/unread-count
  static async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const unreadCount = await NotificationService.getUnreadCount(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم جلب عدد الإشعارات غير المقروءة بنجاح', { unreadCount });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/notifications/:id/read
  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      const notif = await NotificationService.markAsRead(req.user.userId.toString(), req.params.id);
      return ApiResponse.success(res, 200, 'تم تحديث الإشعار إلى مقروء', { id: notif.id.toString(), isRead: true });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v1/notifications/read-all
  static async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw ApiError.unauthorized('يرجى تسجيل الدخول أولاً');
      await NotificationService.markAllAsRead(req.user.userId.toString());
      return ApiResponse.success(res, 200, 'تم تحديد جميع الإشعارات كمقروءة');
    } catch (error) {
      next(error);
    }
  }
}
