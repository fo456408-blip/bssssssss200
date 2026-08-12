import { Router } from 'express';
import { LessonController } from '../controllers/lesson.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const lessonRouter = Router();

// All lesson & video endpoints require authentication
lessonRouter.use(authenticateJWT);

// 1. LESSON MANAGEMENT ENDPOINTS
lessonRouter.get(
  '/courses/:courseId/lessons',
  authorizeRoles('admin', 'teacher', 'student'),
  LessonController.getLessonsByCourse
);

lessonRouter.post(
  '/admin/lessons',
  authorizeRoles('admin', 'teacher'),
  LessonController.createLesson
);

lessonRouter.get(
  '/lessons/:id',
  authorizeRoles('admin', 'teacher', 'student'),
  LessonController.getLessonById
);

lessonRouter.patch(
  '/admin/lessons/:id',
  authorizeRoles('admin', 'teacher'),
  LessonController.updateLesson
);

lessonRouter.patch(
  '/admin/courses/:courseId/lessons/reorder',
  authorizeRoles('admin', 'teacher'),
  LessonController.reorderLessons
);

// 2. VIDEO UPLOAD & R2 PRESIGNED URL ENDPOINTS
lessonRouter.post(
  '/admin/lessons/:lessonId/videos/upload-url',
  authorizeRoles('admin', 'teacher'),
  LessonController.requestVideoUploadUrl
);

lessonRouter.post(
  '/admin/lessons/:lessonId/videos/complete',
  authorizeRoles('admin', 'teacher'),
  LessonController.completeVideoUpload
);

// 3. SECURE VIDEO ACCESS ENDPOINT
lessonRouter.post(
  '/videos/:videoId/access',
  authorizeRoles('admin', 'teacher', 'student'),
  LessonController.getSecureVideoAccess
);

// 4. STUDENT LESSON PROGRESS ENDPOINTS
lessonRouter.get(
  '/student/students/:studentId/lessons/:lessonId/progress',
  authorizeRoles('admin', 'teacher', 'student'),
  LessonController.getStudentProgress
);

lessonRouter.put(
  '/student/lessons/:lessonId/progress',
  authorizeRoles('student'),
  LessonController.updateStudentProgress
);

export default lessonRouter;
