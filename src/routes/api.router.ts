import { Router } from 'express';
import healthRouter from './health.router';
import authRouter from './auth.router';
import adminRouter from './admin.router';
import operationsRouter from './operations.router';
import lessonRouter from './lesson.router';
import quizRouter from './quiz.router';
import assignmentRouter from './assignment.router';
import studentDashboardRouter from './student-dashboard.router';
import parentDashboardRouter from './parent-dashboard.router';
import notificationRouter from './notification.router';
import announcementRouter from './announcement.router';
import auditLogRouter from './audit-log.router';
import reportRouter from './report.router';
import enrollmentRequestRouter from './enrollmentRequest.router';
import { bookingRequestRouter } from './bookingRequest.router';
import teacherRouter from './teacher.router';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/enrollment-requests', enrollmentRequestRouter);
apiRouter.use('/bookings', bookingRequestRouter);
apiRouter.use('/', reportRouter);
apiRouter.use('/', notificationRouter);
apiRouter.use('/', announcementRouter);
apiRouter.use('/', operationsRouter);
apiRouter.use('/', lessonRouter);
apiRouter.use('/', quizRouter);
apiRouter.use('/', assignmentRouter);
apiRouter.use('/', auditLogRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/teacher', teacherRouter);
apiRouter.use('/student', studentDashboardRouter);
apiRouter.use('/parent', parentDashboardRouter);

export default apiRouter;
