import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const router = Router();

// Admin Routes
router.post('/admin/reports/students/:studentId/monthly', authenticateJWT, authorizeRoles('ADMIN', 'admin'), ReportController.generateMonthlyReport);
router.get('/admin/reports', authenticateJWT, authorizeRoles('ADMIN', 'admin'), ReportController.getAdminReports);

// Student Routes
router.get('/student/reports', authenticateJWT, authorizeRoles('STUDENT', 'student'), ReportController.getStudentReports);
router.post('/student/reports/monthly', authenticateJWT, authorizeRoles('STUDENT', 'student'), ReportController.generateStudentMonthlyReport);

// Parent Routes
router.get('/parent/children/:childId/reports', authenticateJWT, authorizeRoles('PARENT', 'parent'), ReportController.getParentChildReports);
router.post('/parent/children/:childId/reports/monthly', authenticateJWT, authorizeRoles('PARENT', 'parent'), ReportController.generateParentChildMonthlyReport);

// Teacher Routes
router.get('/teacher/students/:studentId/reports', authenticateJWT, authorizeRoles('TEACHER', 'teacher'), ReportController.getTeacherStudentReports);
router.post('/teacher/students/:studentId/reports/monthly', authenticateJWT, authorizeRoles('TEACHER', 'teacher'), ReportController.generateTeacherStudentMonthlyReport);

// Secure PDF URL & Direct Streaming Endpoints (Authorized per role)
router.get('/reports/:reportId/pdf', authenticateJWT, ReportController.getReportSignedUrl);
router.get('/reports/:reportId/download', authenticateJWT, ReportController.downloadReportPDF);

export default router;
