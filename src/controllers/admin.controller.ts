import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';
import { paginationSchema } from '../validators/admin.validator';
import { ApiResponse } from '../utils/apiResponse';

export class AdminController {
  // 1. STUDENTS
  static async getStudents(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, status } = paginationSchema.parse(req.query);
      const parentId = req.query.parentId as string | undefined;
      const result = await AdminService.getStudents(page, limit, search, status, parentId);
      return ApiResponse.success(res, 200, 'تم جلب الطلاب بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async getStudentById(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await AdminService.getStudentById(req.params.id);
      return ApiResponse.success(res, 200, 'تم جلب بيانات الطالب بنجax', student);
    } catch (error) {
      next(error);
    }
  }

  static async createStudent(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await AdminService.createStudent(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء حساب الطالب بنجاح', student);
    } catch (error) {
      next(error);
    }
  }

  static async updateStudent(req: Request, res: Response, next: NextFunction) {
    try {
      const student = await AdminService.updateStudent(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث بيانات الطالب بنجاح', student);
    } catch (error) {
      next(error);
    }
  }

  static async toggleStudentStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;
      const user = await AdminService.toggleStudentStatus(req.params.id, isActive);
      return ApiResponse.success(res, 200, 'تم تغيير حالة حساب الطالب بنجاح', user);
    } catch (error) {
      next(error);
    }
  }

  // 2. PARENTS
  static async getParents(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, status } = paginationSchema.parse(req.query);
      const result = await AdminService.getParents(page, limit, search, status);
      return ApiResponse.success(res, 200, 'تم جلب أولياء الأمور بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async getParentById(req: Request, res: Response, next: NextFunction) {
    try {
      const parent = await AdminService.getParentById(req.params.id);
      return ApiResponse.success(res, 200, 'تم جلب بيانات ولي الأمر بنجاح', parent);
    } catch (error) {
      next(error);
    }
  }

  static async createParent(req: Request, res: Response, next: NextFunction) {
    try {
      const parent = await AdminService.createParent(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء حساب ولي الأمر بنجاح', parent);
    } catch (error) {
      next(error);
    }
  }

  static async updateParent(req: Request, res: Response, next: NextFunction) {
    try {
      const parent = await AdminService.updateParent(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث بيانات ولي الأمر بنجاح', parent);
    } catch (error) {
      next(error);
    }
  }

  static async toggleParentStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;
      const user = await AdminService.toggleParentStatus(req.params.id, isActive);
      return ApiResponse.success(res, 200, 'تم تغيير حالة حساب ولي الأمر بنجاح', user);
    } catch (error) {
      next(error);
    }
  }

  static async linkStudentsToParent(req: Request, res: Response, next: NextFunction) {
    try {
      const parent = await AdminService.linkStudentsToParent(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم ربط الطلاب بولي الأمر بنجاح', parent);
    } catch (error) {
      next(error);
    }
  }

  // 3. TEACHERS
  static async getTeachers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, status } = paginationSchema.parse(req.query);
      const result = await AdminService.getTeachers(page, limit, search, status);
      return ApiResponse.success(res, 200, 'تم جلب المعلمين بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async getTeacherById(req: Request, res: Response, next: NextFunction) {
    try {
      const teacher = await AdminService.getTeacherById(req.params.id);
      return ApiResponse.success(res, 200, 'تم جلب بيانات المعلم بنجاح', teacher);
    } catch (error) {
      next(error);
    }
  }

  static async createTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const teacher = await AdminService.createTeacher(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء حساب المعلم بنجاح', teacher);
    } catch (error) {
      next(error);
    }
  }

  static async updateTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const teacher = await AdminService.updateTeacher(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث بيانات المعلم بنجاح', teacher);
    } catch (error) {
      next(error);
    }
  }

  static async toggleTeacherStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;
      const user = await AdminService.toggleTeacherStatus(req.params.id, isActive);
      return ApiResponse.success(res, 200, 'تم تغيير حالة حساب المعلم بنجاح', user);
    } catch (error) {
      next(error);
    }
  }

  static async assignCourseToTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const { courseId } = req.body;
      const result = await AdminService.assignCourseToTeacher(req.params.id, courseId);
      return ApiResponse.success(res, 200, 'تم إسناد الكورس للمعلم بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  static async removeCourseFromTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.removeCourseFromTeacher(req.params.id, req.params.courseId);
      return ApiResponse.success(res, 200, 'تم إزالة إسناد الكورس للمعلم بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  // 5. ACADEMIC YEARS
  static async getAcademicYears(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search } = paginationSchema.parse(req.query);
      const result = await AdminService.getAcademicYears(page, limit, search);
      return ApiResponse.success(res, 200, 'تم جلب السنوات الدراسية بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async createAcademicYear(req: Request, res: Response, next: NextFunction) {
    try {
      const year = await AdminService.createAcademicYear(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء السنة الدراسية بنجاح', year);
    } catch (error) {
      next(error);
    }
  }

  static async updateAcademicYear(req: Request, res: Response, next: NextFunction) {
    try {
      const year = await AdminService.updateAcademicYear(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث السنة الدراسية بنجاح', year);
    } catch (error) {
      next(error);
    }
  }

  static async setCurrentAcademicYear(req: Request, res: Response, next: NextFunction) {
    try {
      const year = await AdminService.setCurrentAcademicYear(req.params.id);
      return ApiResponse.success(res, 200, 'تم تعيين السنة الدراسية كحالية بنجاح', year);
    } catch (error) {
      next(error);
    }
  }

  // 6. COURSES
  static async getCourses(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, status } = paginationSchema.parse(req.query);
      const academicYearId = req.query.academicYearId as string | undefined;
      const result = await AdminService.getCourses(page, limit, search, status, academicYearId);
      return ApiResponse.success(res, 200, 'تم جلب الكورسات بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async createCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const course = await AdminService.createCourse(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء الكورس بنجاح', course);
    } catch (error) {
      next(error);
    }
  }

  static async updateCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const course = await AdminService.updateCourse(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث الكورس بنجاح', course);
    } catch (error) {
      next(error);
    }
  }

  static async toggleCourseStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;
      const course = await AdminService.toggleCourseStatus(req.params.id, isActive);
      return ApiResponse.success(res, 200, 'تم تغيير حالة الكورس بنجاح', course);
    } catch (error) {
      next(error);
    }
  }

  // 7. GROUPS
  static async getGroups(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, status } = paginationSchema.parse(req.query);
      const courseId = req.query.courseId as string | undefined;
      const teacherId = req.query.teacherId as string | undefined;
      const result = await AdminService.getGroups(page, limit, search, status, courseId, teacherId);
      return ApiResponse.success(res, 200, 'تم جلب المجموعات بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async createGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const group = await AdminService.createGroup(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء المجموعة بنجاح', group);
    } catch (error) {
      next(error);
    }
  }

  static async updateGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const group = await AdminService.updateGroup(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث المجموعة بنجاح', group);
    } catch (error) {
      next(error);
    }
  }

  static async toggleGroupStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : true;
      const group = await AdminService.toggleGroupStatus(req.params.id, isActive);
      return ApiResponse.success(res, 200, 'تم تغيير حالة المجموعة بنجاح', group);
    } catch (error) {
      next(error);
    }
  }

  // 8. ENROLLMENTS
  static async getEnrollments(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, status } = paginationSchema.parse(req.query);
      const studentId = req.query.studentId as string | undefined;
      const courseId = req.query.courseId as string | undefined;
      const academicYearId = req.query.academicYearId as string | undefined;
      const result = await AdminService.getEnrollments(page, limit, studentId, courseId, academicYearId, status);
      return ApiResponse.success(res, 200, 'تم جلب الاشتراكات بنجاح', result.items, result.meta as any);
    } catch (error) {
      next(error);
    }
  }

  static async createEnrollment(req: Request, res: Response, next: NextFunction) {
    try {
      const enrollment = await AdminService.createEnrollment(req.body);
      return ApiResponse.success(res, 201, 'تم إنشاء الاشتراك بنجاح', enrollment);
    } catch (error) {
      next(error);
    }
  }

  static async updateEnrollment(req: Request, res: Response, next: NextFunction) {
    try {
      const enrollment = await AdminService.updateEnrollment(req.params.id, req.body);
      return ApiResponse.success(res, 200, 'تم تحديث الاشتراك بنجاح', enrollment);
    } catch (error) {
      next(error);
    }
  }

  // Password Setup Token Generation (Admin Only)
  static async generateStudentPasswordSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.generateStudentPasswordSetup(req.params.studentId);
      return ApiResponse.success(res, 200, 'تم إنشاء رابط تعيين كلمة المرور للطالب بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  static async generateParentPasswordSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const studentId = req.query.studentId as string | undefined;
      const result = await AdminService.generateParentPasswordSetup(req.params.parentId, studentId);
      const msg = result.isActive
        ? 'تم إنشاء رابط إعادة تعيين كلمة المرور لولي الأمر بنجاح'
        : 'تم إنشاء رابط تفعيل حساب ولي الأمر بنجاح';
      return ApiResponse.success(res, 200, msg, result);
    } catch (error) {
      next(error);
    }
  }
}
