import { Router } from 'express';
import { AssignmentController } from '../controllers/assignment.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const assignmentRouter = Router();

// All assignment endpoints require valid JWT authentication
assignmentRouter.use(authenticateJWT);

// 1. ASSIGNMENT MANAGEMENT ENDPOINTS (ADMIN & TEACHER)
assignmentRouter.get(
  '/lessons/:lessonId/assignments',
  authorizeRoles('admin', 'teacher', 'student'),
  AssignmentController.getAssignmentsByLesson
);

assignmentRouter.post(
  '/admin/assignments',
  authorizeRoles('admin', 'teacher'),
  AssignmentController.createAssignment
);

assignmentRouter.get(
  '/assignments/:id',
  authorizeRoles('admin', 'teacher', 'student'),
  AssignmentController.getAssignmentById
);

assignmentRouter.patch(
  '/admin/assignments/:id',
  authorizeRoles('admin', 'teacher'),
  AssignmentController.updateAssignment
);

assignmentRouter.delete(
  '/admin/assignments/:id',
  authorizeRoles('admin', 'teacher'),
  AssignmentController.deleteAssignment
);

assignmentRouter.get(
  '/assignments/:id/submissions',
  authorizeRoles('admin', 'teacher'),
  AssignmentController.getSubmissionsForAssignment
);

assignmentRouter.get(
  '/teacher/assignments/:id/submissions',
  authorizeRoles('admin', 'teacher'),
  AssignmentController.getSubmissionsForAssignment
);

// 2. STUDENT R2 FILE UPLOADS & SUBMISSION ENDPOINTS
assignmentRouter.post(
  '/student/assignments/:assignmentId/upload-url',
  authorizeRoles('student'),
  AssignmentController.getUploadUrl
);

assignmentRouter.post(
  '/student/assignments/:assignmentId/submissions/complete',
  authorizeRoles('student'),
  AssignmentController.completeR2Submission
);

assignmentRouter.post(
  '/student/assignments/:id/submissions',
  authorizeRoles('student'),
  AssignmentController.submitAssignment
);

assignmentRouter.get(
  '/assignments/:id/students/:studentId/submission',
  authorizeRoles('admin', 'teacher', 'student', 'parent'),
  AssignmentController.getStudentSubmission
);

// 3. SECURE SUBMISSION FILE DOWNLOAD ENDPOINTS
assignmentRouter.get(
  '/student/submissions/:submissionId/file',
  authorizeRoles('student'),
  AssignmentController.getSubmissionFile
);

assignmentRouter.get(
  '/teacher/submissions/:submissionId/file',
  authorizeRoles('teacher'),
  AssignmentController.getSubmissionFile
);

assignmentRouter.get(
  '/admin/submissions/:submissionId/file',
  authorizeRoles('admin'),
  AssignmentController.getSubmissionFile
);

// 4. TEACHER GRADING ENDPOINT
assignmentRouter.post(
  '/teacher/submissions/:submissionId/grade',
  authorizeRoles('admin', 'teacher'),
  AssignmentController.gradeSubmission
);

export default assignmentRouter;
