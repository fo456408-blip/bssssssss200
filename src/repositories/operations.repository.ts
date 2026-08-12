import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export class OperationsRepository {
  // 1. CLASS SESSIONS
  static async findSessions(page: number, limit: number, groupId?: string, startDate?: string, endDate?: string, status?: string, allowedGroupIds?: bigint[]) {
    const skip = (page - 1) * limit;
    const where: Prisma.ClassSessionWhereInput = {};

    if (groupId) {
      where.groupId = BigInt(groupId);
    } else if (allowedGroupIds) {
      where.groupId = { in: allowedGroupIds };
    }

    if (status) where.status = status as any;

    if (startDate || endDate) {
      where.sessionDate = {};
      if (startDate) where.sessionDate.gte = new Date(startDate);
      if (endDate) where.sessionDate.lte = new Date(endDate);
    }

    const [total, sessions] = await Promise.all([
      prisma.classSession.count({ where }),
      prisma.classSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sessionDate: 'desc' },
        include: {
          group: {
            include: {
              course: true,
            },
          },
          lesson: true,
          _count: { select: { attendance: true } },
        },
      }),
    ]);

    return { total, sessions };
  }

  static async findSessionById(id: bigint) {
    return prisma.classSession.findUnique({
      where: { id },
      include: {
        group: {
          include: {
            course: true,
            groupStudents: {
              include: {
                student: {
                  include: { user: { select: { fullName: true, username: true, phone: true } } },
                },
              },
            },
          },
        },
        lesson: true,
        attendance: {
          include: {
            student: { include: { user: { select: { fullName: true, username: true } } } },
          },
        },
      },
    });
  }

  // 2. ATTENDANCE
  static async findAttendanceBySession(sessionId: bigint) {
    return prisma.attendance.findMany({
      where: { sessionId: sessionId },
      include: {
        student: { include: { user: { select: { fullName: true, username: true } } } },
      },
    });
  }

  static async findAttendanceByStudent(studentId: bigint, page: number = 1, limit: number = 50, startDate?: string, endDate?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.AttendanceWhereInput = { studentId };

    if (startDate || endDate) {
      where.session = {};
      if (startDate) where.session.sessionDate = { gte: new Date(startDate) };
      if (endDate) where.session.sessionDate = { lte: new Date(endDate) };
    }

    const [total, records] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { session: { sessionDate: 'desc' } },
        include: {
          session: {
            include: {
              group: { include: { course: true } },
              lesson: true,
            },
          },
        },
      }),
    ]);

    return { total, records };
  }

  // 3. PAYMENTS
  static async findPayments(
    page: number,
    limit: number,
    studentId?: string,
    courseId?: string,
    month?: number,
    year?: number,
    status?: string,
    paymentMethod?: string
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.PaymentWhereInput = {};

    if (month) where.billingMonth = month;
    if (year) where.billingYear = year;
    if (status) where.status = status as any;
    if (paymentMethod) where.paymentMethod = paymentMethod as any;

    if (studentId || courseId) {
      where.enrollment = {};
      if (studentId) where.enrollment.studentId = BigInt(studentId);
      if (courseId) where.enrollment.courseId = BigInt(courseId);
    }

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
        include: {
          enrollment: {
            include: {
              student: { include: { user: { select: { fullName: true, username: true } } } },
              course: true,
              academicYear: true,
            },
          },
        },
      }),
    ]);

    return { total, payments };
  }

  static async findPaymentById(id: bigint) {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        enrollment: {
          include: {
            student: { include: { user: { select: { fullName: true, username: true, phone: true } } } },
            course: true,
            academicYear: true,
          },
        },
      },
    });
  }
}
