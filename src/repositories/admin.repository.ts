import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export class AdminRepository {
  // 1. Students Repository
  static async findStudents(page: number, limit: number, search?: string, status?: string, parentId?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.StudentWhereInput = {};

    if (status !== undefined && status !== '') {
      where.user = { isActive: status === 'true' };
    }

    if (parentId) {
      where.parentId = BigInt(parentId);
    }

    if (search) {
      where.OR = [
        { user: { fullName: { contains: search } } },
        { user: { username: { contains: search } } },
        { schoolName: { contains: search } },
      ];
    }

    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          user: {
            select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true },
          },
          parent: {
            include: {
              user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
            },
          },
          groupMembers: {
            include: { group: true },
          },
          enrollments: {
            include: { course: true },
          },
        },
      }),
    ]);

    return { total, students };
  }

  static async findStudentById(id: bigint) {
    return prisma.student.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
        parent: { include: { user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } } } },
        groupMembers: { include: { group: { include: { course: true } } } },
        enrollments: { include: { course: true, academicYear: true } },
      },
    });
  }

  static async findAllStudents(skip: number, take: number, search?: string, grade?: any, isActive?: boolean) {
    const where: any = {};

    if (search) {
      where.OR = [
        { user: { fullName: { contains: search } } },
        { user: { username: { contains: search } } },
        { user: { phone: { contains: search } } },
      ];
    }
    if (grade) where.grade = grade;
    if (isActive !== undefined) where.user = { ...where.user, isActive };

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
          parent: { include: { user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } } } },
          groupMembers: { include: { group: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.student.count({ where }),
    ]);

    return { items, total };
  }

  // --- TEACHER REPOSITORY ---
  static async findTeacherById(id: bigint) {
    return prisma.teacher.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
        teacherCourses: { include: { course: true } },
      },
    });
  }

  static async findAllTeachers(skip: number, take: number, search?: string, isActive?: boolean) {
    const where: any = {};
    if (search) {
      where.OR = [
        { user: { fullName: { contains: search } } },
        { user: { username: { contains: search } } },
      ];
    }
    if (isActive !== undefined) where.user = { isActive };

    const [items, total] = await Promise.all([
      prisma.teacher.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
          teacherCourses: { include: { course: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.teacher.count({ where }),
    ]);

    return { items, total };
  }

  // --- GROUP REPOSITORY ---
  static async findGroupById(id: bigint) {
    return prisma.group.findUnique({
      where: { id },
      include: {
        course: true,
        groupStudents: { include: { student: { include: { user: { select: { fullName: true, phone: true } } } } } },
      },
    });
  }

  static async findAllGroups(skip: number, take: number, courseId?: bigint) {
    const where: any = {};
    if (courseId) where.courseId = courseId;

    const [items, total] = await Promise.all([
      prisma.group.findMany({
        where,
        skip,
        take,
        include: {
          course: { select: { name: true } },
          _count: { select: { groupStudents: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.group.count({ where }),
    ]);

    return { items, total };
  }

  // 2. Parents Repository
  static async findParents(page: number, limit: number, search?: string, status?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.ParentWhereInput = {};

    if (status !== undefined && status !== '') {
      where.user = { isActive: status === 'true' };
    }

    if (search) {
      where.OR = [
        { user: { fullName: { contains: search } } },
        { user: { username: { contains: search } } },
        { occupation: { contains: search } },
      ];
    }

    const [total, parents] = await Promise.all([
      prisma.parent.count({ where }),
      prisma.parent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
          students: {
            include: {
              user: { select: { fullName: true, id: true } },
            },
          },
        },
      }),
    ]);

    return { total, parents };
  }

  static async findParentById(id: bigint) {
    return prisma.parent.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
        students: { include: { user: { select: { fullName: true, id: true } } } },
      },
    });
  }

  // 3. Teachers Repository
  static async findTeachers(page: number, limit: number, search?: string, status?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.TeacherWhereInput = {};

    if (status !== undefined && status !== '') {
      where.user = { isActive: status === 'true' };
    }

    if (search) {
      where.OR = [
        { user: { fullName: { contains: search } } },
        { user: { username: { contains: search } } },
        { specialization: { contains: search } },
      ];
    }

    const [total, teachers] = await Promise.all([
      prisma.teacher.count({ where }),
      prisma.teacher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
          teacherCourses: { include: { course: true } },
        },
      }),
    ]);

    return { total, teachers };
  }

  // 5. Academic Years Repository
  static async findAcademicYears(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.AcademicYearWhereInput = {};
    if (search) where.name = { contains: search };

    const [total, academicYears] = await Promise.all([
      prisma.academicYear.count({ where }),
      prisma.academicYear.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
      }),
    ]);

    return { total, academicYears };
  }

  // 6. Courses Repository
  static async findCourses(page: number, limit: number, search?: string, status?: string, academicYearId?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.CourseWhereInput = {};

    if (status !== undefined && status !== '') {
      where.isActive = status === 'true';
    }

    if (academicYearId) where.academicYearId = BigInt(academicYearId);

    if (search) {
      where.OR = [{ name: { contains: search } }, { code: { contains: search } }];
    }

    const [total, courses] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          academicYear: true,
          teacherCourses: {
            include: {
              teacher: {
                include: {
                  user: { select: { id: true, fullName: true, username: true } },
                },
              },
            },
          },
          _count: { select: { groups: true, lessons: true, enrollments: true } },
        },
      }),
    ]);

    return { total, courses };
  }

  // 7. Groups Repository
  static async findGroups(page: number, limit: number, search?: string, status?: string, courseId?: string, teacherId?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.GroupWhereInput = {};

    if (courseId) where.courseId = BigInt(courseId);

    if (search) {
      where.name = { contains: search };
    }

    const [total, groups] = await Promise.all([
      prisma.group.count({ where }),
      prisma.group.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          course: true,
          _count: { select: { groupStudents: true, classSessions: true } },
        },
      }),
    ]);

    return { total, groups };
  }

  // 8. Enrollments Repository
  static async findEnrollments(page: number, limit: number, studentId?: string, courseId?: string, academicYearId?: string, status?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.EnrollmentWhereInput = {};

    if (status) where.status = status as any;
    if (studentId) where.studentId = BigInt(studentId);
    if (courseId) where.courseId = BigInt(courseId);
    if (academicYearId) where.academicYearId = BigInt(academicYearId);

    const [total, enrollments] = await Promise.all([
      prisma.enrollment.count({ where }),
      prisma.enrollment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          student: { include: { user: { select: { fullName: true, username: true } } } },
          course: true,
          academicYear: true,
          payments: true,
        },
      }),
    ]);

    return { total, enrollments };
  }
}
