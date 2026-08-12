import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const adminRouter = Router();

// Protect ALL admin routes with JWT + Admin Role Guard
adminRouter.use(authenticateJWT, authorizeRoles('admin'));

// 1. STUDENTS
adminRouter.get('/students', AdminController.getStudents);
adminRouter.post('/students', AdminController.createStudent);
adminRouter.get('/students/:id', AdminController.getStudentById);
adminRouter.patch('/students/:id', AdminController.updateStudent);
adminRouter.patch('/students/:id/status', AdminController.toggleStudentStatus);
adminRouter.post('/students/:studentId/password-setup', AdminController.generateStudentPasswordSetup);

// 2. PARENTS
adminRouter.get('/parents', AdminController.getParents);
adminRouter.post('/parents', AdminController.createParent);
adminRouter.get('/parents/:id', AdminController.getParentById);
adminRouter.patch('/parents/:id', AdminController.updateParent);
adminRouter.patch('/parents/:id/status', AdminController.toggleParentStatus);
adminRouter.post('/parents/:id/link-students', AdminController.linkStudentsToParent);
adminRouter.post('/parents/:parentId/password-setup', AdminController.generateParentPasswordSetup);

// 3. TEACHERS
adminRouter.get('/teachers', AdminController.getTeachers);
adminRouter.post('/teachers', AdminController.createTeacher);
adminRouter.get('/teachers/:id', AdminController.getTeacherById);
adminRouter.patch('/teachers/:id', AdminController.updateTeacher);
adminRouter.patch('/teachers/:id/status', AdminController.toggleTeacherStatus);
adminRouter.post('/teachers/:id/courses', AdminController.assignCourseToTeacher);
adminRouter.delete('/teachers/:id/courses/:courseId', AdminController.removeCourseFromTeacher);

// 5. ACADEMIC YEARS
adminRouter.get('/academic-years', AdminController.getAcademicYears);
adminRouter.post('/academic-years', AdminController.createAcademicYear);
adminRouter.patch('/academic-years/:id', AdminController.updateAcademicYear);
adminRouter.patch('/academic-years/:id/current', AdminController.setCurrentAcademicYear);

// 6. COURSES
adminRouter.get('/courses', AdminController.getCourses);
adminRouter.post('/courses', AdminController.createCourse);
adminRouter.patch('/courses/:id', AdminController.updateCourse);
adminRouter.patch('/courses/:id/status', AdminController.toggleCourseStatus);

// 7. GROUPS
adminRouter.get('/groups', AdminController.getGroups);
adminRouter.post('/groups', AdminController.createGroup);
adminRouter.patch('/groups/:id', AdminController.updateGroup);
adminRouter.patch('/groups/:id/status', AdminController.toggleGroupStatus);

// 8. ENROLLMENTS
adminRouter.get('/enrollments', AdminController.getEnrollments);
adminRouter.post('/enrollments', AdminController.createEnrollment);
adminRouter.patch('/enrollments/:id', AdminController.updateEnrollment);

export default adminRouter;
