import { Router } from 'express';
import { EnrollmentRequestController } from '../controllers/enrollmentRequest.controller';
import { authenticateJWT, authorizeRoles, loginRateLimiter } from '../middleware/auth.middleware';

const enrollmentRequestRouter = Router();

// Public submission endpoints (/join and /)
enrollmentRequestRouter.post('/join', loginRateLimiter, EnrollmentRequestController.create);
enrollmentRequestRouter.post('/', loginRateLimiter, EnrollmentRequestController.create);

// Protected Admin / Teacher endpoints
enrollmentRequestRouter.get(
  '/',
  authenticateJWT,
  authorizeRoles('admin', 'teacher'),
  EnrollmentRequestController.list
);

enrollmentRequestRouter.post(
  '/:id/approve',
  authenticateJWT,
  authorizeRoles('admin', 'teacher'),
  EnrollmentRequestController.approve
);

enrollmentRequestRouter.post(
  '/:id/reject',
  authenticateJWT,
  authorizeRoles('admin', 'teacher'),
  EnrollmentRequestController.reject
);

export default enrollmentRequestRouter;
