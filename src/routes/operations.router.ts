import { Router } from 'express';
import { OperationsController } from '../controllers/operations.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const operationsRouter = Router();

// All operational routes require valid JWT authentication
operationsRouter.use(authenticateJWT);

// 1. CLASS SESSIONS ENDPOINTS
operationsRouter.get(
  '/sessions',
  authorizeRoles('admin', 'teacher'),
  OperationsController.getSessions
);

operationsRouter.post(
  '/sessions',
  authorizeRoles('admin', 'teacher'),
  OperationsController.createSession
);

operationsRouter.get(
  '/sessions/:id',
  authorizeRoles('admin', 'teacher'),
  OperationsController.getSessionById
);

operationsRouter.patch(
  '/sessions/:id',
  authorizeRoles('admin'),
  OperationsController.updateSession
);

// 2. ATTENDANCE ENDPOINTS
operationsRouter.get(
  '/sessions/:sessionId/attendance',
  authorizeRoles('admin', 'teacher'),
  OperationsController.getAttendanceSheet
);

operationsRouter.put(
  '/sessions/:sessionId/attendance',
  authorizeRoles('admin', 'teacher'),
  OperationsController.saveAttendanceSheet
);

operationsRouter.get(
  '/attendance/student/:studentId/stats',
  authorizeRoles('admin', 'teacher', 'student', 'parent'),
  OperationsController.getStudentAttendanceStats
);

// 3. PAYMENTS & FINANCIAL ENDPOINTS
operationsRouter.get(
  '/payments',
  authorizeRoles('admin', 'student', 'parent'), // Teachers strictly blocked
  OperationsController.getPayments
);

operationsRouter.post(
  '/payments',
  authorizeRoles('admin'),
  OperationsController.recordPayment
);

operationsRouter.patch(
  '/payments/:id',
  authorizeRoles('admin'),
  OperationsController.updatePayment
);

operationsRouter.get(
  '/payments/:id/receipt',
  authorizeRoles('admin', 'student', 'parent'),
  OperationsController.getReceipt
);

export default operationsRouter;
