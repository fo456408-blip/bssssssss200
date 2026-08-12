import { prisma } from '../config/database';
import { OperationsRepository } from '../repositories/operations.repository';
import { ApiError } from '../utils/apiError';
import {
  createSessionSchema,
  updateSessionSchema,
  bulkAttendanceSchema,
  createPaymentSchema,
  updatePaymentSchema,
} from '../validators/operations.validator';
import { SessionStatus, AttendanceStatus, PaymentStatus, PaymentMethod } from '@prisma/client';

export class OperationsService {
  private static serialize(obj: any): any {
    return JSON.parse(
      JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
  }

  // 1. CLASS SESSION SERVICES
  static async getSessions(page: number, limit: number, groupId?: string, startDate?: string, endDate?: string, status?: string, teacherUserId?: string) {
    let allowedGroupIds: bigint[] | undefined = undefined;
    if (teacherUserId) {
      const { TeacherService } = await import('./teacher.service');
      allowedGroupIds = await TeacherService.getAssignedGroupIds(teacherUserId);
    }
    const { total, sessions } = await OperationsRepository.findSessions(page, limit, groupId, startDate, endDate, status, allowedGroupIds);
    return {
      items: this.serialize(sessions),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async getSessionById(id: string) {
    const session = await OperationsRepository.findSessionById(BigInt(id));
    if (!session) throw ApiError.notFound('الحصة غير موجودة');
    return this.serialize(session);
  }

  static async createSession(input: any) {
    const data = createSessionSchema.parse(input);

    const group = await prisma.group.findUnique({ where: { id: BigInt(data.groupId) } });
    if (!group) throw ApiError.badRequest('المجموعة غير موجودة');

    if (data.lessonId) {
      const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(data.lessonId) } });
      if (!lesson) throw ApiError.badRequest('الدرس المحدد غير موجود');
    }

    const session = await prisma.classSession.create({
      data: {
        groupId: BigInt(data.groupId),
        lessonId: data.lessonId ? BigInt(data.lessonId) : null,
        sessionDate: new Date(data.sessionDate),
        topic: data.topic || null,
        notes: data.notes || null,
        status: SessionStatus.SCHEDULED,
      },
      include: { group: { include: { course: true } }, lesson: true },
    });

    return this.serialize(session);
  }

  static async updateSession(id: string, input: any) {
    const data = updateSessionSchema.parse(input);
    const session = await prisma.classSession.findUnique({ where: { id: BigInt(id) } });
    if (!session) throw ApiError.notFound('الحصة غير موجودة');

    const updated = await prisma.classSession.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.lessonId !== undefined && { lessonId: data.lessonId ? BigInt(data.lessonId) : null }),
        ...(data.sessionDate && { sessionDate: new Date(data.sessionDate) }),
        ...(data.topic !== undefined && { topic: data.topic }),
        ...(data.status && { status: data.status as SessionStatus }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: { group: { include: { course: true } }, lesson: true },
    });

    return this.serialize(updated);
  }

  // 2. ATTENDANCE SHEET & BULK SAVING SERVICES
  static async getAttendanceSheet(sessionId: string) {
    const session = await prisma.classSession.findUnique({
      where: { id: BigInt(sessionId) },
      include: {
        group: {
          include: {
            course: true,
            groupStudents: { include: { student: { include: { user: true } } } },
          },
        },
        attendance: true,
      },
    });
    if (!session) throw ApiError.notFound('الحصة غير موجودة');

    // Get all active students enrolled in this group
    const groupStudents = session.group.groupStudents.map((sg: any) => sg.student);

    // Existing attendance records
    const attendanceMap = new Map<string, any>();
    session.attendance.forEach((att: any) => {
      attendanceMap.set(att.studentId.toString(), att);
    });

    // Prepare sheet items
    const sheetItems = groupStudents.map((st: any) => {
      const existing = attendanceMap.get(st.id.toString());
      return {
        studentId: st.id.toString(),
        fullName: st.user.fullName,
        username: st.user.username,
        phone: st.user.phone,
        status: existing ? existing.status : AttendanceStatus.PRESENT,
        notes: existing ? existing.notes : '',
      };
    });

    return {
      session: this.serialize({
        id: session.id,
        groupName: session.group.name,
        courseName: session.group.course.name,
        sessionDate: session.sessionDate,
        topic: session.topic,
        status: session.status,
      }),
      students: sheetItems,
    };
  }

  static async saveAttendanceSheet(sessionId: string, input: any) {
    const { attendance } = bulkAttendanceSchema.parse(input);
    const session = await prisma.classSession.findUnique({
      where: { id: BigInt(sessionId) },
      include: { group: { include: { groupStudents: true } } },
    });
    if (!session) throw ApiError.notFound('الحصة غير موجودة');

    if (session.status === SessionStatus.CANCELLED) {
      throw ApiError.badRequest('لا يمكن تسجيل الحضور لحصة ملغاة');
    }

    // Verify all students belong to the group
    const groupStudentIds = new Set(session.group.groupStudents.map((sg) => sg.studentId.toString()));
    for (const record of attendance) {
      if (!groupStudentIds.has(record.studentId)) {
        throw ApiError.badRequest(`الطالب المعرف برقم ${record.studentId} غير مسجل في هذه المجموعة`);
      }
    }

    // Bulk Upsert in a transaction
    await prisma.$transaction(async (tx) => {
      for (const rec of attendance) {
        await tx.attendance.upsert({
          where: {
            sessionId_studentId: {
              sessionId: BigInt(sessionId),
              studentId: BigInt(rec.studentId),
            },
          },
          update: {
            status: rec.status as AttendanceStatus,
            notes: rec.notes || null,
            markedAt: new Date(),
          },
          create: {
            sessionId: BigInt(sessionId),
            studentId: BigInt(rec.studentId),
            status: rec.status as AttendanceStatus,
            notes: rec.notes || null,
          },
        });
      }

      // Mark session completed if scheduled
      if (session.status === SessionStatus.SCHEDULED) {
        await tx.classSession.update({
          where: { id: BigInt(sessionId) },
          data: { status: SessionStatus.COMPLETED },
        });
      }
    });

    return this.getAttendanceSheet(sessionId);
  }

  // 3. ATTENDANCE STATISTICS CALCULATION ENGINE
  static async calculateStudentAttendanceStats(studentId: string, startDate?: string, endDate?: string) {
    const student = await prisma.student.findUnique({ where: { id: BigInt(studentId) } });
    if (!student) throw ApiError.notFound('الطالب غير موجود');

    const where: any = {
      studentId: BigInt(studentId),
      session: { status: { not: SessionStatus.CANCELLED } }, // Cancelled sessions excluded!
    };

    if (startDate || endDate) {
      where.session.sessionDate = {};
      if (startDate) where.session.sessionDate.gte = new Date(startDate);
      if (endDate) where.session.sessionDate.lte = new Date(endDate);
    }

    const records = await prisma.attendance.findMany({
      where,
      include: { session: true },
    });

    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    records.forEach((r) => {
      if (r.status === AttendanceStatus.PRESENT) present++;
      else if (r.status === AttendanceStatus.ABSENT) absent++;
      else if (r.status === AttendanceStatus.LATE) late++;
      else if (r.status === AttendanceStatus.EXCUSED) excused++;
    });

    const totalValidSessions = present + absent + late + excused;
    const percentage = totalValidSessions > 0 ? ((present + late) / totalValidSessions) * 100 : 0;

    return {
      studentId,
      totalValidSessions,
      present,
      absent,
      late,
      excused,
      percentage: Number(percentage.toFixed(2)),
    };
  }

  // 4. PAYMENT SERVICES & AGREED FEE PRICE LOCK
  static async getPayments(
    page: number,
    limit: number,
    studentId?: string,
    courseId?: string,
    month?: number,
    year?: number,
    status?: string,
    paymentMethod?: string
  ) {
    const { total, payments } = await OperationsRepository.findPayments(page, limit, studentId, courseId, month, year, status, paymentMethod);
    return {
      items: this.serialize(payments),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async getPaymentById(id: string) {
    const payment = await OperationsRepository.findPaymentById(BigInt(id));
    if (!payment) throw ApiError.notFound('إيصال السداد غير موجود');
    return this.serialize(payment);
  }

  static async recordPayment(input: any) {
    const data = createPaymentSchema.parse(input);

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: BigInt(data.enrollmentId) },
      include: { student: { include: { user: true } }, course: true },
    });
    if (!enrollment) throw ApiError.badRequest('الاشتراك غير موجود');

    // Unique Constraint Check: UNIQUE(enrollment_id, billing_month, billing_year)
    const existing = await prisma.payment.findUnique({
      where: {
        enrollmentId_billingMonth_billingYear: {
          enrollmentId: BigInt(data.enrollmentId),
          billingMonth: data.billingMonth,
          billingYear: data.billingYear,
        },
      },
    });

    if (existing) {
      throw ApiError.badRequest(`تم تسجيل مصاريف شهر ${data.billingMonth}/${data.billingYear} بالفعل لـ ${enrollment.student.user.fullName}`);
    }

    const payment = await prisma.payment.create({
      data: {
        enrollmentId: BigInt(data.enrollmentId),
        billingMonth: data.billingMonth,
        billingYear: data.billingYear,
        amount: data.amount,
        status: data.status as PaymentStatus,
        paymentMethod: data.paymentMethod as PaymentMethod,
        paidDate: data.paidDate ? new Date(data.paidDate) : new Date(),
        notes: data.notes || null,
      },
      include: {
        enrollment: {
          include: {
            student: { include: { user: { select: { fullName: true, username: true } } } },
            course: true,
            academicYear: true,
          },
        },
      },
    });

    return this.serialize(payment);
  }

  static async updatePayment(id: string, input: any) {
    const data = updatePaymentSchema.parse(input);
    const payment = await prisma.payment.findUnique({ where: { id: BigInt(id) } });
    if (!payment) throw ApiError.notFound('الدفعة غير موجودة');

    const updated = await prisma.payment.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.status && { status: data.status as PaymentStatus }),
        ...(data.paymentMethod && { paymentMethod: data.paymentMethod as PaymentMethod }),
        ...(data.paidDate && { paidDate: new Date(data.paidDate) }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        enrollment: {
          include: {
            student: { include: { user: { select: { fullName: true } } } },
            course: true,
          },
        },
      },
    });

    return this.serialize(updated);
  }

  // 5. BASIC PAYMENT RECEIPT GENERATOR
  static async generateReceipt(paymentId: string) {
    const payment = await OperationsRepository.findPaymentById(BigInt(paymentId));
    if (!payment) throw ApiError.notFound('إيصال السداد غير موجود');

    return {
      receiptNumber: `REC-${payment.id.toString()}-${payment.billingYear}${payment.billingMonth.toString().padStart(2, '0')}`,
      academyName: 'EngCode by Ahmed Hamed Academy',
      studentName: payment.enrollment.student.user.fullName,
      studentUsername: payment.enrollment.student.user.username,
      courseName: payment.enrollment.course.name,
      academicYear: payment.enrollment.academicYear.name,
      billingPeriod: `${payment.billingMonth}/${payment.billingYear}`,
      amountPaid: payment.amount.toString(),
      agreedMonthlyFee: payment.enrollment.monthlyFee.toString(),
      paymentStatus: payment.status,
      paymentMethod: payment.paymentMethod,
      issuedAt: payment.paidDate || payment.createdAt,
      notes: payment.notes || '',
    };
  }
}
