import crypto from 'crypto';
import { prisma } from '../config/database';
import { AdminRepository } from '../repositories/admin.repository';
import { PasswordUtils } from '../utils/password';
import { ApiError } from '../utils/apiError';
import {
  createStudentSchema,
  updateStudentSchema,
  createParentSchema,
  updateParentSchema,
  linkStudentsSchema,
  createTeacherSchema,
  updateTeacherSchema,
  createAcademicYearSchema,
  updateAcademicYearSchema,
  createCourseSchema,
  updateCourseSchema,
  createGroupSchema,
  updateGroupSchema,
  createEnrollmentSchema,
  updateEnrollmentSchema,
} from '../validators/admin.validator';
import { UserRole, StudentGrade, SessionStatus, AttendanceStatus, QuestionType, QuizAttemptStatus, PaymentStatus, PaymentMethod, EnrollmentStatus } from '@prisma/client';

export class AdminService {
  // Helper to stringify BigInt properties for standard JSON serialization
  private static serialize(obj: any): any {
    return JSON.parse(
      JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
  }

  // 1. STUDENT MANAGEMENT SERVICES
  static async getStudents(page: number, limit: number, search?: string, status?: string, parentId?: string) {
    const { total, students } = await AdminRepository.findStudents(page, limit, search, status, parentId);
    return {
      items: this.serialize(students),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async getStudentById(id: string) {
    const student = await AdminRepository.findStudentById(BigInt(id));
    if (!student) throw ApiError.notFound('الطالب غير موجود');
    return this.serialize(student);
  }

  static async createStudent(input: any) {
    const data = createStudentSchema.parse(input);

    // Check username uniqueness
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) throw ApiError.badRequest('اسم المستخدم مستخدم بالفعل');

    // Check parent exists if parentId provided
    if (data.parentId) {
      const parent = await prisma.parent.findUnique({ where: { id: BigInt(data.parentId) } });
      if (!parent) throw ApiError.badRequest('ولي الأمر المحدد غير موجود');
    }

    const hashedPassword = await PasswordUtils.hashPassword(data.password);

    // Transaction: Create User + Student Profile
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: data.username,
          passwordHash: hashedPassword,
          fullName: data.fullName,
          role: UserRole.STUDENT,
          phone: data.phone,
          email: data.email || null,
        },
      });

      const student = await tx.student.create({
        data: {
          userId: user.id,
          parentId: data.parentId ? BigInt(data.parentId) : null,
          grade: data.grade as StudentGrade,
          schoolName: data.schoolName || null,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        },
        include: { user: true, parent: true },
      });

      return student;
    });

    return this.serialize(result);
  }

  static async updateStudent(id: string, input: any) {
    const data = updateStudentSchema.parse(input);
    const student = await prisma.student.findUnique({ where: { id: BigInt(id) } });
    if (!student) throw ApiError.notFound('الطالب غير موجود');

    const result = await prisma.$transaction(async (tx) => {
      if (data.fullName || data.phone || data.email !== undefined) {
        await tx.user.update({
          where: { id: student.userId },
          data: {
            ...(data.fullName && { fullName: data.fullName }),
            ...(data.phone && { phone: data.phone }),
            ...(data.email !== undefined && { email: data.email || null }),
          },
        });
      }

      const updatedStudent = await tx.student.update({
        where: { id: BigInt(id) },
        data: {
          ...(data.parentId !== undefined && { parentId: data.parentId ? BigInt(data.parentId) : null }),
          ...(data.grade && { grade: data.grade as StudentGrade }),
          ...(data.schoolName !== undefined && { schoolName: data.schoolName }),
          ...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }),
        },
        include: { user: true, parent: true },
      });

      return updatedStudent;
    });

    return this.serialize(result);
  }

  static async toggleStudentStatus(id: string, isActive: boolean) {
    const student = await prisma.student.findUnique({ where: { id: BigInt(id) } });
    if (!student) throw ApiError.notFound('الطالب غير موجود');

    const user = await prisma.user.update({
      where: { id: student.userId },
      data: { isActive },
    });

    return this.serialize(user);
  }

  // 2. PARENT MANAGEMENT SERVICES
  static async getParents(page: number, limit: number, search?: string, status?: string) {
    const { total, parents } = await AdminRepository.findParents(page, limit, search, status);
    return {
      items: this.serialize(parents),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async getParentById(id: string) {
    const parent = await AdminRepository.findParentById(BigInt(id));
    if (!parent) throw ApiError.notFound('ولي الأمر غير موجود');
    return this.serialize(parent);
  }

  static async createParent(input: any) {
    const data = createParentSchema.parse(input);
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) throw ApiError.badRequest('اسم المستخدم مستخدم بالفعل');

    const hashedPassword = await PasswordUtils.hashPassword(data.password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: data.username,
          passwordHash: hashedPassword,
          fullName: data.fullName,
          role: UserRole.PARENT,
          phone: data.phone,
          email: data.email || null,
        },
      });

      const parent = await tx.parent.create({
        data: {
          userId: user.id,
          occupation: data.occupation || null,
          notes: data.notes || null,
        },
        include: { user: true },
      });

      return parent;
    });

    return this.serialize(result);
  }

  static async updateParent(id: string, input: any) {
    const data = updateParentSchema.parse(input);
    const parent = await prisma.parent.findUnique({ where: { id: BigInt(id) } });
    if (!parent) throw ApiError.notFound('ولي الأمر غير موجود');

    const result = await prisma.$transaction(async (tx) => {
      if (data.fullName || data.phone || data.email !== undefined) {
        await tx.user.update({
          where: { id: parent.userId },
          data: {
            ...(data.fullName && { fullName: data.fullName }),
            ...(data.phone && { phone: data.phone }),
            ...(data.email !== undefined && { email: data.email || null }),
          },
        });
      }

      const updatedParent = await tx.parent.update({
        where: { id: BigInt(id) },
        data: {
          ...(data.occupation !== undefined && { occupation: data.occupation }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: { user: true },
      });

      return updatedParent;
    });

    return this.serialize(result);
  }

  static async toggleParentStatus(id: string, isActive: boolean) {
    const parent = await prisma.parent.findUnique({ where: { id: BigInt(id) } });
    if (!parent) throw ApiError.notFound('ولي الأمر غير موجود');

    const user = await prisma.user.update({
      where: { id: parent.userId },
      data: { isActive },
    });

    return this.serialize(user);
  }

  static async linkStudentsToParent(parentId: string, input: any) {
    const { studentIds } = linkStudentsSchema.parse(input);
    const parent = await prisma.parent.findUnique({ where: { id: BigInt(parentId) } });
    if (!parent) throw ApiError.notFound('ولي الأمر غير موجود');

    await prisma.student.updateMany({
      where: { id: { in: studentIds.map((sid) => BigInt(sid)) } },
      data: { parentId: BigInt(parentId) },
    });

    return this.getParentById(parentId);
  }

  // 3. TEACHER MANAGEMENT SERVICES
  static async getTeachers(page: number, limit: number, search?: string, status?: string) {
    const { total, teachers } = await AdminRepository.findTeachers(page, limit, search, status);
    return {
      items: this.serialize(teachers),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async getTeacherById(id: string) {
    const teacher = await AdminRepository.findTeacherById(BigInt(id));
    if (!teacher) throw ApiError.notFound('المعلم غير موجود');
    return this.serialize(teacher);
  }

  static async createTeacher(input: any) {
    const data = createTeacherSchema.parse(input);
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) throw ApiError.badRequest('اسم المستخدم مستخدم بالفعل');

    const hashedPassword = await PasswordUtils.hashPassword(data.password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: data.username,
          passwordHash: hashedPassword,
          fullName: data.fullName,
          role: UserRole.TEACHER,
          phone: data.phone,
          email: data.email || null,
        },
      });

      const teacher = await tx.teacher.create({
        data: {
          userId: user.id,
          specialization: data.specialization || null,
          bio: data.bio || null,
        },
        include: { user: true },
      });

      return teacher;
    });

    return this.serialize(result);
  }

  static async updateTeacher(id: string, input: any) {
    const data = updateTeacherSchema.parse(input);
    const teacher = await prisma.teacher.findUnique({ where: { id: BigInt(id) } });
    if (!teacher) throw ApiError.notFound('المعلم غير موجود');

    const result = await prisma.$transaction(async (tx) => {
      if (data.fullName || data.phone || data.email !== undefined) {
        await tx.user.update({
          where: { id: teacher.userId },
          data: {
            ...(data.fullName && { fullName: data.fullName }),
            ...(data.phone && { phone: data.phone }),
            ...(data.email !== undefined && { email: data.email || null }),
          },
        });
      }

      const updatedTeacher = await tx.teacher.update({
        where: { id: BigInt(id) },
        data: {
          ...(data.specialization !== undefined && { specialization: data.specialization }),
          ...(data.bio !== undefined && { bio: data.bio }),
        },
        include: { user: true },
      });

      return updatedTeacher;
    });

    return this.serialize(result);
  }

  static async toggleTeacherStatus(id: string, isActive: boolean) {
    const teacher = await prisma.teacher.findUnique({ where: { id: BigInt(id) } });
    if (!teacher) throw ApiError.notFound('المعلم غير موجود');

    const user = await prisma.user.update({
      where: { id: teacher.userId },
      data: { isActive },
    });

    return this.serialize(user);
  }

  static async assignCourseToTeacher(teacherId: string, courseId: string) {
    const tId = BigInt(teacherId);
    const cId = BigInt(courseId);

    const [teacher, course] = await Promise.all([
      prisma.teacher.findUnique({ where: { id: tId } }),
      prisma.course.findUnique({ where: { id: cId } }),
    ]);

    if (!teacher) throw ApiError.notFound('المعلم غير موجود');
    if (!course) throw ApiError.notFound('الكورس غير موجود');

    const teacherCourse = await prisma.teacherCourse.upsert({
      where: { teacherId_courseId: { teacherId: tId, courseId: cId } },
      create: { teacherId: tId, courseId: cId },
      update: {},
      include: { course: true },
    });

    return this.serialize(teacherCourse);
  }

  static async removeCourseFromTeacher(teacherId: string, courseId: string) {
    const tId = BigInt(teacherId);
    const cId = BigInt(courseId);

    await prisma.teacherCourse.deleteMany({
      where: { teacherId: tId, courseId: cId },
    });

    return { success: true, message: 'تم إزالة إسناد الكورس للمعلم بنجاح' };
  }

  // 5. ACADEMIC YEAR MANAGEMENT SERVICES
  static async getAcademicYears(page: number, limit: number, search?: string) {
    const { total, academicYears } = await AdminRepository.findAcademicYears(page, limit, search);
    return {
      items: this.serialize(academicYears),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async createAcademicYear(input: any) {
    const data = createAcademicYearSchema.parse(input);
    const existing = await prisma.academicYear.findUnique({ where: { name: data.name } });
    if (existing) throw ApiError.badRequest('اسم السنة الدراسية مستخدم بالفعل');

    if (data.isCurrent) {
      const year = await prisma.$transaction(async (tx) => {
        await tx.academicYear.updateMany({ data: { isCurrent: false } });
        return tx.academicYear.create({
          data: {
            name: data.name,
            startDate: new Date(data.startDate),
            endDate: new Date(data.endDate),
            isCurrent: true,
          },
        });
      });
      return this.serialize(year);
    }

    const year = await prisma.academicYear.create({
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isCurrent: false,
      },
    });

    return this.serialize(year);
  }

  static async updateAcademicYear(id: string, input: any) {
    const data = updateAcademicYearSchema.parse(input);
    const year = await prisma.academicYear.findUnique({ where: { id: BigInt(id) } });
    if (!year) throw ApiError.notFound('السنة الدراسية غير موجودة');

    if (data.isCurrent) {
      const result = await prisma.$transaction(async (tx) => {
        await tx.academicYear.updateMany({ data: { isCurrent: false } });
        return tx.academicYear.update({
          where: { id: BigInt(id) },
          data: {
            ...(data.name && { name: data.name }),
            ...(data.startDate && { startDate: new Date(data.startDate) }),
            ...(data.endDate && { endDate: new Date(data.endDate) }),
            isCurrent: true,
          },
        });
      });
      return this.serialize(result);
    }

    const result = await prisma.academicYear.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) }),
        ...(data.isCurrent !== undefined && { isCurrent: data.isCurrent }),
      },
    });

    return this.serialize(result);
  }

  static async setCurrentAcademicYear(id: string) {
    const year = await prisma.academicYear.findUnique({ where: { id: BigInt(id) } });
    if (!year) throw ApiError.notFound('السنة الدراسية غير موجودة');

    const result = await prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ data: { isCurrent: false } });
      return tx.academicYear.update({
        where: { id: BigInt(id) },
        data: { isCurrent: true },
      });
    });

    return this.serialize(result);
  }

  // 6. COURSE MANAGEMENT SERVICES
  static async getCourses(page: number, limit: number, search?: string, status?: string, academicYearId?: string) {
    const { total, courses } = await AdminRepository.findCourses(page, limit, search, status, academicYearId);
    return {
      items: this.serialize(courses),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async createCourse(input: any) {
    const data = createCourseSchema.parse(input);
    const existing = await prisma.course.findUnique({ where: { code: data.code } });
    if (existing) throw ApiError.badRequest('كود المادة الدراسية مستخدم بالفعل');

    const academicYear = await prisma.academicYear.findUnique({ where: { id: BigInt(data.academicYearId) } });
    if (!academicYear) throw ApiError.badRequest('السنة الدراسية غير موجودة');

    const course = await prisma.course.create({
      data: {
        academicYearId: BigInt(data.academicYearId),
        code: data.code,
        name: data.name,
        grade: (data.grade as any) || 'FIRST_SECONDARY',
        description: data.description || null,
        defaultMonthlyFee: data.defaultMonthlyFee,
      },
    });

    if (data.teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: BigInt(data.teacherId) } });
      if (teacher) {
        await prisma.teacherCourse.create({
          data: { teacherId: teacher.id, courseId: course.id },
        });
      }
    }

    const fullCourse = await prisma.course.findUnique({
      where: { id: course.id },
      include: {
        academicYear: true,
        teacherCourses: {
          include: {
            teacher: {
              include: { user: { select: { id: true, fullName: true, username: true } } },
            },
          },
        },
      },
    });

    return this.serialize(fullCourse);
  }

  static async updateCourse(id: string, input: any) {
    const data = updateCourseSchema.parse(input);
    const courseId = BigInt(id);
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw ApiError.notFound('المادة الدراسية غير موجودة');

    await prisma.course.update({
      where: { id: courseId },
      data: {
        ...(data.academicYearId && { academicYearId: BigInt(data.academicYearId) }),
        ...(data.code && { code: data.code }),
        ...(data.name && { name: data.name }),
        ...(data.grade && { grade: data.grade as any }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.defaultMonthlyFee !== undefined && { defaultMonthlyFee: data.defaultMonthlyFee }),
      },
    });

    if (data.teacherId !== undefined) {
      // Remove existing teacher assignment for this course
      await prisma.teacherCourse.deleteMany({ where: { courseId } });

      if (data.teacherId && data.teacherId !== '') {
        const teacher = await prisma.teacher.findUnique({ where: { id: BigInt(data.teacherId) } });
        if (teacher) {
          await prisma.teacherCourse.create({
            data: { teacherId: teacher.id, courseId },
          });
        }
      }
    }

    const updated = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        academicYear: true,
        teacherCourses: {
          include: {
            teacher: {
              include: { user: { select: { id: true, fullName: true, username: true } } },
            },
          },
        },
      },
    });

    return this.serialize(updated);
  }

  static async toggleCourseStatus(id: string, isActive: boolean) {
    const course = await prisma.course.update({
      where: { id: BigInt(id) },
      data: { isActive },
    });
    return this.serialize(course);
  }

  // 7. GROUP MANAGEMENT SERVICES
  static async getGroups(page: number, limit: number, search?: string, status?: string, courseId?: string, teacherId?: string) {
    const { total, groups } = await AdminRepository.findGroups(page, limit, search, status, courseId, teacherId);
    return {
      items: this.serialize(groups),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async createGroup(input: any) {
    const data = createGroupSchema.parse(input);
    const course = await prisma.course.findUnique({ where: { id: BigInt(data.courseId) } });
    if (!course) throw ApiError.badRequest('الكورس غير موجود');

    if (data.teacherId) {
      const teacher = await prisma.teacher.findUnique({ where: { id: BigInt(data.teacherId) } });
      if (!teacher) throw ApiError.badRequest('المعلم غير موجود');
    }

    const group = await prisma.group.create({
      data: {
        courseId: BigInt(data.courseId),
        name: data.name,
        maxCapacity: data.maxCapacity || 30,
        schedule: data.schedules ? JSON.stringify(data.schedules) : null,
      },
      include: { course: true },
    });

    return this.serialize(group);
  }

  static async updateGroup(id: string, input: any) {
    const data = updateGroupSchema.parse(input);
    const group = await prisma.group.findUnique({ where: { id: BigInt(id) } });
    if (!group) throw ApiError.notFound('المجموعة غير موجودة');

    const updated = await prisma.group.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.courseId && { courseId: BigInt(data.courseId) }),
        ...(data.name && { name: data.name }),
        ...(data.maxCapacity && { maxCapacity: data.maxCapacity }),
        ...(data.schedules !== undefined && { schedule: JSON.stringify(data.schedules) }),
      },
      include: { course: true },
    });

    return this.serialize(updated);
  }

  static async toggleGroupStatus(id: string, isActive: boolean) {
    const group = await prisma.group.findUnique({
      where: { id: BigInt(id) },
    });
    return this.serialize(group);
  }

  // 8. ENROLLMENT MANAGEMENT SERVICES
  static async getEnrollments(page: number, limit: number, studentId?: string, courseId?: string, academicYearId?: string, status?: string) {
    const { total, enrollments } = await AdminRepository.findEnrollments(page, limit, studentId, courseId, academicYearId, status);
    return {
      items: this.serialize(enrollments),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async createEnrollment(input: any) {
    const data = createEnrollmentSchema.parse(input);

    const student = await prisma.student.findUnique({ where: { id: BigInt(data.studentId) } });
    if (!student) throw ApiError.badRequest('الطالب غير موجود');

    const course = await prisma.course.findUnique({ where: { id: BigInt(data.courseId) } });
    if (!course) throw ApiError.badRequest('الكورس غير موجود');

    const academicYear = await prisma.academicYear.findUnique({ where: { id: BigInt(data.academicYearId) } });
    if (!academicYear) throw ApiError.badRequest('السنة الدراسية غير موجودة');

    // Check duplicate enrollment
    const existing = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: BigInt(data.studentId),
          courseId: BigInt(data.courseId),
        },
      },
    });
    if (existing) throw ApiError.badRequest('الطالب مشترك بالفعل في هذا الكورس لنفس السنة الدراسية');

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: BigInt(data.studentId),
        courseId: BigInt(data.courseId),
        academicYearId: BigInt(data.academicYearId),
        monthlyFee: data.monthlyFee, // Locks agreed price!
        status: EnrollmentStatus.ACTIVE,
      },
      include: { student: { include: { user: true } }, course: true, academicYear: true },
    });

    return this.serialize(enrollment);
  }

  static async updateEnrollment(id: string, input: any) {
    const data = updateEnrollmentSchema.parse(input);
    const enrollment = await prisma.enrollment.findUnique({ where: { id: BigInt(id) } });
    if (!enrollment) throw ApiError.notFound('الاشتراك غير موجود');

    const updated = await prisma.enrollment.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.monthlyFee !== undefined && { monthlyFee: data.monthlyFee }),
        ...(data.status && { status: data.status as EnrollmentStatus }),
      },
      include: { student: { include: { user: true } }, course: true, academicYear: true },
    });

    return this.serialize(updated);
  }

  // Password Setup Token Generation (Admin Only)
  static async generateStudentPasswordSetup(studentId: string) {
    const student = await prisma.student.findUnique({
      where: { id: BigInt(studentId) },
      include: { user: true },
    });
    if (!student) throw ApiError.notFound('الطالب غير موجود');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Valid for 7 days

    await prisma.user.update({
      where: { id: student.userId },
      data: {
        activationTokenHash: tokenHash,
        activationTokenExpires: tokenExpires,
      },
    });

    return {
      studentId: student.id.toString(),
      fullName: student.user.fullName,
      phone: student.user.phone,
      username: student.user.username,
      isActive: student.user.isActive,
      activationToken: rawToken,
      activationLink: `/activate?token=${rawToken}`,
    };
  }

  static async generateParentPasswordSetup(parentId: string, studentId?: string) {
    const parent = await prisma.parent.findUnique({
      where: { id: BigInt(parentId) },
      include: { user: true },
    });
    if (!parent) throw ApiError.notFound('ولي الأمر غير موجود');

    if (studentId) {
      const student = await prisma.student.findUnique({
        where: { id: BigInt(studentId) },
      });
      if (!student || student.parentId !== parent.id) {
        throw ApiError.forbidden('ولي الأمر غير مرتبط بهذا الطالب');
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Valid for 7 days

    await prisma.user.update({
      where: { id: parent.userId },
      data: {
        activationTokenHash: tokenHash,
        activationTokenExpires: tokenExpires,
      },
    });

    return {
      parentId: parent.id.toString(),
      fullName: parent.user.fullName,
      phone: parent.user.phone,
      username: parent.user.username,
      isActive: parent.user.isActive,
      activationToken: rawToken,
      activationLink: `/activate?token=${rawToken}`,
    };
  }
}
