import { Router } from 'express';
import { ParentDashboardController } from '../controllers/parent-dashboard.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const parentDashboardRouter = Router();

// All parent dashboard endpoints require valid JWT authentication & parent role
parentDashboardRouter.use(authenticateJWT, authorizeRoles('parent'));

parentDashboardRouter.get('/dashboard', ParentDashboardController.getDashboard);
parentDashboardRouter.get('/profile', ParentDashboardController.getProfile);
parentDashboardRouter.get('/children', ParentDashboardController.getChildren);
parentDashboardRouter.get('/children/:childId', ParentDashboardController.getChildOverview);
parentDashboardRouter.get('/children/:childId/courses', ParentDashboardController.getChildCourses);
parentDashboardRouter.get('/children/:childId/courses/:courseId', ParentDashboardController.getChildCourseDetails);
parentDashboardRouter.get('/children/:childId/attendance', ParentDashboardController.getChildAttendance);
parentDashboardRouter.get('/children/:childId/quizzes', ParentDashboardController.getChildQuizzes);
parentDashboardRouter.get('/children/:childId/assignments', ParentDashboardController.getChildAssignments);
parentDashboardRouter.get('/children/:childId/payments', ParentDashboardController.getChildPayments);
parentDashboardRouter.get('/activity', ParentDashboardController.getActivity);

export default parentDashboardRouter;
