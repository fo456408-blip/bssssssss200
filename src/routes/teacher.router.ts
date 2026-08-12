import { Router } from 'express';
import { TeacherController } from '../controllers/teacher.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const teacherRouter = Router();

// Protect ALL teacher endpoints with JWT + Teacher Role Guard
teacherRouter.use(authenticateJWT, authorizeRoles('teacher'));

teacherRouter.get('/courses', TeacherController.getCourses);

// Group Management Endpoints
teacherRouter.get('/groups', TeacherController.getGroups);
teacherRouter.post('/groups', TeacherController.createGroup);
teacherRouter.patch('/groups/:id', TeacherController.updateGroup);
teacherRouter.delete('/groups/:id', TeacherController.deleteGroup);

// Group Student Management Endpoints
teacherRouter.get('/groups/:id/students', TeacherController.getGroupStudents);
teacherRouter.post('/groups/:id/students', TeacherController.addStudentToGroup);
teacherRouter.delete('/groups/:id/students/:studentId', TeacherController.removeStudentFromGroup);

teacherRouter.get('/students', TeacherController.getStudents);
teacherRouter.get('/dashboard', TeacherController.getDashboardStats);

export default teacherRouter;
