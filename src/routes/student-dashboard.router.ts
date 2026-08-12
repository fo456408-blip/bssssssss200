import { Router } from 'express';
import { StudentDashboardController } from '../controllers/student-dashboard.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const studentDashboardRouter = Router();

// All student dashboard endpoints require valid JWT authentication & student role
studentDashboardRouter.use(authenticateJWT, authorizeRoles('student'));

studentDashboardRouter.get('/dashboard', StudentDashboardController.getDashboard);
studentDashboardRouter.get('/profile', StudentDashboardController.getProfile);
studentDashboardRouter.get('/courses', StudentDashboardController.getCourses);
studentDashboardRouter.get('/courses/:courseId', StudentDashboardController.getCourseDetails);
studentDashboardRouter.get('/attendance', StudentDashboardController.getAttendance);
studentDashboardRouter.get('/payments', StudentDashboardController.getPayments);
studentDashboardRouter.get('/quizzes', StudentDashboardController.getQuizzes);
studentDashboardRouter.get('/assignments', StudentDashboardController.getAssignments);
studentDashboardRouter.get('/activity', StudentDashboardController.getActivity);

export default studentDashboardRouter;
