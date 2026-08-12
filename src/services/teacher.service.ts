import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { UserRole } from '@prisma/client';

export class TeacherService {
  // Helper to serialize BigInt fields
  private static serialize(data: any): any {
    return JSON.parse(
      JSON.stringify(data, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
  }

  // 1. Get Teacher record from userId
  static async getTeacherByUserId(userId: bigint | string | number) {
    const uId = BigInt(userId);
    const teacher = await prisma.teacher.findUnique({
      where: { userId: uId },
      include: {
        user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
        teacherCourses: { include: { course: true } },
      },
    });
    if (!teacher) {
      throw ApiError.forbidden('حساب المعلم غير موجود');
    }
    return teacher;
  }

  // 2. Get array of Course IDs assigned to Teacher
  static async getAssignedCourseIds(userId: bigint | string | number): Promise<bigint[]> {
    const uId = BigInt(userId);
    const teacher = await prisma.teacher.findUnique({
      where: { userId: uId },
      select: {
        id: true,
        teacherCourses: { select: { courseId: true } },
      },
    });
    if (!teacher) return [];
    return teacher.teacherCourses.map((tc) => tc.courseId);
  }

  // 3. Get array of Group IDs assigned to Teacher (groups under assigned courses)
  static async getAssignedGroupIds(userId: bigint | string | number): Promise<bigint[]> {
    const courseIds = await this.getAssignedCourseIds(userId);
    if (courseIds.length === 0) return [];
    const groups = await prisma.group.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true },
    });
    return groups.map((g) => g.id);
  }

  // 4. Verify Course Access
  static async verifyCourseAccess(userId: bigint | string | number, courseId: bigint | string, userRole: string) {
    const roleUpper = (userRole || '').toString().toUpperCase();
    if (roleUpper === 'ADMIN' || roleUpper === UserRole.ADMIN) return;
    const cIdStr = courseId.toString();
    const assignedIds = await this.getAssignedCourseIds(userId);
    const hasAccess = assignedIds.some((id) => id.toString() === cIdStr);
    if (!hasAccess) {
      throw ApiError.forbidden('ليس لديك صلاحية للوصول إلى هذا الكورس.');
    }
  }

  // 5. Verify Group Access
  static async verifyGroupAccess(userId: bigint | string | number, groupId: bigint | string, userRole: string) {
    if (userRole === 'ADMIN' || userRole === UserRole.ADMIN) return;
    const gId = BigInt(groupId);
    const group = await prisma.group.findUnique({ where: { id: gId }, select: { courseId: true } });
    if (!group) throw ApiError.notFound('المجموعة غير موجودة');
    await this.verifyCourseAccess(userId, group.courseId, userRole);
  }

  // 6. Verify Lesson Access
  static async verifyLessonAccess(userId: bigint | string | number, lessonId: bigint | string, userRole: string) {
    if (userRole === 'ADMIN' || userRole === UserRole.ADMIN) return;
    const lId = BigInt(lessonId);
    const lesson = await prisma.lesson.findUnique({ where: { id: lId }, select: { courseId: true } });
    if (!lesson) throw ApiError.notFound('الدرس غير موجود');
    await this.verifyCourseAccess(userId, lesson.courseId, userRole);
  }

  // 7. Verify Quiz Access
  static async verifyQuizAccess(userId: bigint | string | number, quizId: bigint | string, userRole: string) {
    if (userRole === 'ADMIN' || userRole === UserRole.ADMIN) return;
    const qId = BigInt(quizId);
    const quiz = await prisma.quiz.findUnique({
      where: { id: qId },
      include: { lesson: { select: { courseId: true } } },
    });
    if (!quiz) throw ApiError.notFound('الاختبار غير موجود');
    await this.verifyCourseAccess(userId, quiz.lesson.courseId, userRole);
  }

  // 8. Verify Assignment Access
  static async verifyAssignmentAccess(userId: bigint | string | number, assignmentId: bigint | string, userRole: string) {
    if (userRole === 'ADMIN' || userRole === UserRole.ADMIN) return;
    const aId = BigInt(assignmentId);
    const assignment = await prisma.assignment.findUnique({
      where: { id: aId },
      include: { lesson: { select: { courseId: true } } },
    });
    if (!assignment) throw ApiError.notFound('الواجب غير موجود');
    await this.verifyCourseAccess(userId, assignment.lesson.courseId, userRole);
  }

  // 9. Verify Session Access
  static async verifySessionAccess(userId: bigint | string | number, sessionId: bigint | string, userRole: string) {
    if (userRole === 'ADMIN' || userRole === UserRole.ADMIN) return;
    const sId = BigInt(sessionId);
    const session = await prisma.classSession.findUnique({ where: { id: sId }, select: { groupId: true } });
    if (!session) throw ApiError.notFound('الحصة غير موجودة');
    await this.verifyGroupAccess(userId, session.groupId, userRole);
  }

  // 10. Verify Booking Request Access
  static async verifyBookingAccess(userId: bigint | string | number, bookingId: bigint | string, userRole: string) {
    if (userRole === 'ADMIN' || userRole === UserRole.ADMIN) return;
    const bId = BigInt(bookingId);
    const booking = await prisma.bookingRequest.findUnique({ where: { id: bId }, select: { courseId: true } });
    if (!booking) throw ApiError.notFound('طلب الحجز غير موجود');
    if (booking.courseId) {
      await this.verifyCourseAccess(userId, booking.courseId, userRole);
    }
  }

  // --- TEACHER DATA ENDPOINTS ---

  // 11. Get Courses Assigned to Teacher
  static async getTeacherCourses(userId: bigint | string | number) {
    const courseIds = await this.getAssignedCourseIds(userId);
    if (courseIds.length === 0) return [];

    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds }, isActive: true },
      include: {
        academicYear: { select: { id: true, name: true } },
        groups: {
          select: {
            id: true,
            name: true,
            maxCapacity: true,
            _count: { select: { groupStudents: true } },
          },
        },
        _count: { select: { lessons: true, enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.serialize(courses);
  }

  // 12. Get Groups Assigned to Teacher
  static async getTeacherGroups(userId: bigint | string | number) {
    const courseIds = await this.getAssignedCourseIds(userId);
    if (courseIds.length === 0) return [];

    const groups = await prisma.group.findMany({
      where: { courseId: { in: courseIds } },
      include: {
        course: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: { select: { groupStudents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.serialize(groups);
  }

  // 12a. Create Group by Teacher (Scope Enforced)
  static async createTeacherGroup(userId: bigint | string | number, userRole: string, input: any) {
    const { courseId, name, maxCapacity, schedules } = input;
    if (!courseId || !name) {
      throw ApiError.badRequest('يرجى تحديد المادة الدراسية واسم المجموعة');
    }

    const cId = BigInt(courseId);
    await this.verifyCourseAccess(userId, cId, userRole);

    const group = await prisma.group.create({
      data: {
        courseId: cId,
        name: name.trim(),
        maxCapacity: maxCapacity ? Number(maxCapacity) : 30,
        schedule: schedules ? JSON.stringify(schedules) : null,
      },
      include: {
        course: { select: { id: true, name: true } },
        _count: { select: { groupStudents: true } },
      },
    });

    return this.serialize(group);
  }

  // 12b. Update Group by Teacher (Scope Enforced)
  static async updateTeacherGroup(userId: bigint | string | number, userRole: string, groupId: bigint | string | number, input: any) {
    const gId = BigInt(groupId);
    await this.verifyGroupAccess(userId, gId, userRole);

    const { name, maxCapacity, schedules } = input;

    const updatedGroup = await prisma.group.update({
      where: { id: gId },
      data: {
        ...(name && { name: name.trim() }),
        ...(maxCapacity && { maxCapacity: Number(maxCapacity) }),
        ...(schedules !== undefined && { schedule: JSON.stringify(schedules) }),
      },
      include: {
        course: { select: { id: true, name: true } },
        _count: { select: { groupStudents: true } },
      },
    });

    return this.serialize(updatedGroup);
  }

  // 12c. Delete Group by Teacher (Scope Enforced)
  static async deleteTeacherGroup(userId: bigint | string | number, userRole: string, groupId: bigint | string | number) {
    const gId = BigInt(groupId);
    await this.verifyGroupAccess(userId, gId, userRole);

    await prisma.group.delete({
      where: { id: gId },
    });

    return { success: true, message: 'تم حذف المجموعة بنجاح' };
  }

  // 12d. Get Group Students (Scope Enforced)
  static async getGroupStudents(userId: bigint | string | number, userRole: string, groupId: bigint | string | number) {
    const gId = BigInt(groupId);
    await this.verifyGroupAccess(userId, gId, userRole);

    const groupStudents = await prisma.groupStudent.findMany({
      where: { groupId: gId },
      include: {
        student: {
          include: {
            user: { select: { id: true, fullName: true, phone: true, username: true } },
            parent: { include: { user: { select: { fullName: true, phone: true } } } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return this.serialize(groupStudents);
  }

  // 12e. Add Student to Group (Scope Enforced)
  static async addStudentToGroup(userId: bigint | string | number, userRole: string, groupId: bigint | string | number, studentId: bigint | string | number) {
    const gId = BigInt(groupId);
    const sId = BigInt(studentId);
    await this.verifyGroupAccess(userId, gId, userRole);

    const group = await prisma.group.findUnique({ where: { id: gId }, select: { courseId: true, maxCapacity: true, _count: { select: { groupStudents: true } } } });
    if (!group) throw ApiError.notFound('المجموعة غير موجودة');

    if (group._count.groupStudents >= group.maxCapacity) {
      throw ApiError.badRequest('تم الوصول إلى الحد الأقصى لسعة المجموعة');
    }

    const existing = await prisma.groupStudent.findUnique({
      where: { groupId_studentId: { groupId: gId, studentId: sId } },
    });
    if (existing) throw ApiError.badRequest('الطالب مضاف بالفعل إلى هذه المجموعة');

    const created = await prisma.groupStudent.create({
      data: { groupId: gId, studentId: sId },
      include: {
        student: {
          include: {
            user: { select: { id: true, fullName: true, phone: true, username: true } },
          },
        },
      },
    });

    return this.serialize(created);
  }

  // 12f. Remove Student from Group (Scope Enforced)
  static async removeStudentFromGroup(userId: bigint | string | number, userRole: string, groupId: bigint | string | number, studentId: bigint | string | number) {
    const gId = BigInt(groupId);
    const sId = BigInt(studentId);
    await this.verifyGroupAccess(userId, gId, userRole);

    await prisma.groupStudent.deleteMany({
      where: { groupId: gId, studentId: sId },
    });

    return { success: true, message: 'تم إزالة الطالب من المجموعة بنجاح' };
  }

  // 13. Get Students Enrolled in Teacher's Assigned Courses
  static async getTeacherStudents(userId: bigint | string | number, search?: string) {
    const courseIds = await this.getAssignedCourseIds(userId);
    if (courseIds.length === 0) return [];

    const where: any = {
      enrollments: {
        some: {
          courseId: { in: courseIds },
          status: 'ACTIVE',
        },
      },
    };

    if (search) {
      where.OR = [
        { user: { fullName: { contains: search } } },
        { user: { username: { contains: search } } },
        { user: { phone: { contains: search } } },
        { schoolName: { contains: search } },
      ];
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, fullName: true, phone: true, email: true, isActive: true } },
        parent: { include: { user: { select: { id: true, username: true, fullName: true, phone: true } } } },
        groupMembers: {
          where: { group: { courseId: { in: courseIds } } },
          include: { group: { select: { id: true, name: true } } },
        },
        enrollments: {
          where: { courseId: { in: courseIds } },
          include: { course: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.serialize(students);
  }

  // 14. Get Dashboard Stats for Teacher
  static async getTeacherDashboardStats(userId: bigint | string | number) {
    const courseIds = await this.getAssignedCourseIds(userId);
    const groupIds = await this.getAssignedGroupIds(userId);

    const totalStudents = await prisma.student.count({
      where: {
        enrollments: {
          some: {
            courseId: { in: courseIds },
            status: 'ACTIVE',
          },
        },
      },
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todaySessionsCount = await prisma.classSession.count({
      where: {
        groupId: { in: groupIds },
        sessionDate: { gte: startOfDay, lte: endOfDay },
      },
    });

    const pendingBookingsCount = await prisma.bookingRequest.count({
      where: {
        courseId: { in: courseIds },
        status: 'PENDING',
      },
    });

    const lessons = await prisma.lesson.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true },
    });
    const lessonIds = lessons.map((l) => l.id);

    const assignments = await prisma.assignment.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { id: true },
    });
    const assignmentIds = assignments.map((a) => a.id);

    const pendingAssignmentsCount = await prisma.studentAssignment.count({
      where: {
        assignmentId: { in: assignmentIds },
        status: { in: ['SUBMITTED', 'LATE'] },
      },
    });

    const upcomingQuizzesCount = await prisma.quiz.count({
      where: {
        lessonId: { in: lessonIds },
        isPublished: true,
      },
    });

    const todaySessions = await prisma.classSession.findMany({
      where: {
        groupId: { in: groupIds },
        sessionDate: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        group: {
          select: {
            name: true,
            course: { select: { name: true } },
            _count: { select: { groupStudents: true } },
          },
        },
      },
      orderBy: { sessionDate: 'asc' },
    });

    return this.serialize({
      stats: {
        totalStudents,
        todaySessions: todaySessionsCount,
        pendingBookings: pendingBookingsCount,
        pendingAssignments: pendingAssignmentsCount,
        upcomingQuizzes: upcomingQuizzesCount,
        pendingReports: 0,
      },
      todaySchedule: todaySessions.map((s) => ({
        id: s.id.toString(),
        courseName: s.group.course.name,
        groupName: s.group.name,
        time: s.sessionDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        studentsCount: s.group._count.groupStudents,
        status: s.status,
      })),
    });
  }
}
