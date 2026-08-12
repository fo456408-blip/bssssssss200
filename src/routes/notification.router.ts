import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const notificationRouter = Router();

notificationRouter.get('/notifications', authenticateJWT, NotificationController.getNotifications);
notificationRouter.get('/notifications/unread-count', authenticateJWT, NotificationController.getUnreadCount);
notificationRouter.patch('/notifications/read-all', authenticateJWT, NotificationController.markAllAsRead);
notificationRouter.patch('/notifications/:id/read', authenticateJWT, NotificationController.markAsRead);

export default notificationRouter;
