import { Router } from 'express';
import { QuizController } from '../controllers/quiz.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const quizRouter = Router();

// All quiz endpoints require valid JWT authentication
quizRouter.use(authenticateJWT);

// 1. QUIZ & QUESTION MANAGEMENT ENDPOINTS (ADMIN & TEACHER)
quizRouter.get(
  '/lessons/:lessonId/quizzes',
  authorizeRoles('admin', 'teacher', 'student'),
  QuizController.getQuizzesByLesson
);

quizRouter.post(
  '/admin/quizzes',
  authorizeRoles('admin', 'teacher'),
  QuizController.createQuiz
);

quizRouter.get(
  '/quizzes/:id',
  authorizeRoles('admin', 'teacher', 'student'),
  QuizController.getQuizById
);

quizRouter.patch(
  '/admin/quizzes/:id',
  authorizeRoles('admin', 'teacher'),
  QuizController.updateQuiz
);

quizRouter.delete(
  '/admin/quizzes/:id',
  authorizeRoles('admin', 'teacher'),
  QuizController.deleteQuiz
);

quizRouter.post(
  '/admin/quiz-questions',
  authorizeRoles('admin', 'teacher'),
  QuizController.addQuestion
);

quizRouter.patch(
  '/admin/quiz-questions/:id',
  authorizeRoles('admin', 'teacher'),
  QuizController.updateQuestion
);

quizRouter.delete(
  '/admin/quiz-questions/:id',
  authorizeRoles('admin', 'teacher'),
  QuizController.deleteQuestion
);

quizRouter.patch(
  '/admin/quizzes/:quizId/questions/reorder',
  authorizeRoles('admin', 'teacher'),
  QuizController.reorderQuestions
);

// 2. STUDENT ATTEMPT & AUTO-GRADING SUBMISSION ENDPOINTS
quizRouter.post(
  '/student/quizzes/:quizId/attempts',
  authorizeRoles('student'),
  QuizController.startAttempt
);

quizRouter.post(
  '/student/attempts/:attemptId/submit',
  authorizeRoles('student'),
  QuizController.submitAttempt
);

quizRouter.get(
  '/quizzes/:quizId/students/:studentId/attempts',
  authorizeRoles('admin', 'teacher', 'student', 'parent'),
  QuizController.getStudentAttempts
);

export default quizRouter;
