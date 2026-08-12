import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateJWT, authorizeRoles, loginRateLimiter } from '../middleware/auth.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { prisma } from '../config/database';

const authRouter = Router();

authRouter.post('/login', loginRateLimiter, AuthController.login);
authRouter.post('/refresh', AuthController.refresh);
authRouter.get('/refresh', AuthController.refresh);
authRouter.post('/logout', AuthController.logout);
authRouter.get('/me', authenticateJWT, AuthController.me);

// Testing Routes for Verification
authRouter.get('/test-admin', authenticateJWT, authorizeRoles('admin'), (_req, res) => {
  return ApiResponse.success(res, 200, 'Welcome Admin');
});
authRouter.get('/test-teacher', authenticateJWT, authorizeRoles('teacher'), (_req, res) => {
  return ApiResponse.success(res, 200, 'Welcome Teacher');
});
authRouter.get('/student-data/:studentId', authenticateJWT, (req, res, next) => {
  const reqStudentId = req.params.studentId;
  const user = req.user!;

  // If user is STUDENT, they can only access their own student profile/data
  if (user.role === 'student') {
    // We lookup the student profile associated with the user id
    prisma.student.findUnique({
      where: { userId: user.userId },
    }).then((studentProfile) => {
      if (!studentProfile || studentProfile.id.toString() !== reqStudentId) {
        return next(ApiError.forbidden('لا يمكنك الوصول إلى بيانات طالب آخر'));
      }
      return ApiResponse.success(res, 200, 'Student data accessed successfully');
    }).catch(next);
  } else {
    // Admins, teachers, parents have general access in this testing endpoint
    return ApiResponse.success(res, 200, 'Student data accessed successfully by privileged user');
  }
});

export default authRouter;
