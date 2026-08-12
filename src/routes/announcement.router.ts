import { Router } from 'express';
import { AnnouncementController } from '../controllers/announcement.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const announcementRouter = Router();

// User active announcements list
announcementRouter.get('/announcements', authenticateJWT, AnnouncementController.getForUser);

// Admin & Teacher announcement management routes
announcementRouter.get('/admin/announcements', authenticateJWT, authorizeRoles('admin', 'teacher'), AnnouncementController.getAdminAnnouncements);
announcementRouter.post('/admin/announcements', authenticateJWT, authorizeRoles('admin', 'teacher'), AnnouncementController.create);
announcementRouter.patch('/admin/announcements/:id', authenticateJWT, authorizeRoles('admin', 'teacher'), AnnouncementController.update);
announcementRouter.patch('/admin/announcements/:id/publish', authenticateJWT, authorizeRoles('admin', 'teacher'), AnnouncementController.publish);

export default announcementRouter;
