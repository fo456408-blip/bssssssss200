import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { BookingStatus, StudentGrade, LearningMode, UserRole, NotificationType } from '@prisma/client';
import { CreateBookingRequestInput, RejectBookingRequestInput, ActivateAccountInput } from '../validators/bookingRequest.validator';
import { NotificationService } from './notification.service';
import { AuditLogService } from './audit-log.service';

export class BookingRequestService {
  // 1. Public Catalogue Listings (المواد الدراسية)
  static async getPublicCourses() {
    return prisma.course.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        grade: true,
        description: true,
        defaultMonthlyFee: true,
        academicYear: { select: { id: true, name: true } },
        _count: { select: { groups: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  static async getPublicGroupsByCourse(courseId: bigint) {
    const groups = await prisma.group.findMany({
      where: { courseId },
      select: {
        id: true,
        courseId: true,
        name: true,
        maxCapacity: true,
        schedule: true,
        _count: { select: { groupStudents: true } },
      },
      orderBy: { name: 'asc' },
    });

    return groups.map((g: any) => {
      const enrolledCount = g._count.groupStudents;
      const remainingCapacity = Math.max(0, g.maxCapacity - enrolledCount);
      return {
        ...g,
        enrolledCount,
        remainingCapacity,
        isFull: remainingCapacity <= 0,
      };
    });
  }

  // 2. Public Booking Submission
  static async createBookingRequest(input: any) {
    const cId = BigInt(input.courseId);
    const gId = BigInt(input.groupId);

    // A. Verify Course exists & is active
    const course = await prisma.course.findUnique({
      where: { id: cId },
      include: { academicYear: true },
    });
    if (!course) {
      throw new Error('المادة الدراسية المختارة غير موجودة');
    }
    if (!course.isActive) {
      throw new Error('هذه المادة الدراسية غير متاحة للتسجيل حالياً');
    }

    // Use course grade directly or derive from academicYear if needed
    const derivedGrade: StudentGrade = (course as any).grade || StudentGrade.FIRST_SECONDARY;

    // B. Verify Group exists & belongs to Course
    const group = await prisma.group.findUnique({
      where: { id: gId },
      include: { _count: { select: { groupStudents: true } } },
    });
    if (!group || group.courseId !== cId) {
      throw new Error('الموعد/المجموعة المحددة لا تنتمي لهذه المادة الدراسية');
    }

    // C. Initial Capacity Check
    const enrolledCount = group._count.groupStudents;
    if (enrolledCount >= group.maxCapacity) {
      throw new Error('المجموعة مكتملة العدد، يرجى اختيار موعد آخر');
    }

    // D. Prevent Duplicate Pending Bookings for same student & group
    const existingPending = await prisma.bookingRequest.findFirst({
      where: {
        studentPhone: input.studentPhone,
        groupId: gId,
        status: BookingStatus.PENDING,
      },
    });
    if (existingPending) {
      throw new Error('يوجد طلب حجز قيد المراجعة بالفعل برقم الهاتف هذا لنفس الموعد');
    }

    // E. Create BookingRequest (PENDING - Mandatory IN_PERSON)
    const booking = await prisma.bookingRequest.create({
      data: {
        studentName: input.studentName,
        studentPhone: input.studentPhone,
        parentName: input.parentName,
        parentPhone: input.parentPhone,
        courseId: cId,
        groupId: gId,
        grade: derivedGrade,
        learningMode: LearningMode.IN_PERSON,
        notes: input.notes || null,
        status: BookingStatus.PENDING,
      },
      include: {
        course: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, schedule: true } },
      },
    });

    return booking;
  }

  // 3. Protected Teacher / Admin Portal Listings
  static async listBookingRequests(
    reviewerRole: UserRole | string,
    reviewerUserId: bigint,
    filters: {
      status?: BookingStatus;
      courseId?: bigint;
      groupId?: bigint;
    } = {}
  ) {
    const where: any = {};

    if (filters.status) where.status = filters.status;
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.groupId) where.groupId = filters.groupId;

    const normalizedRole = reviewerRole ? reviewerRole.toString().toUpperCase() : '';

    // Strict Teacher Authorization Filter
    if (normalizedRole === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({ where: { userId: reviewerUserId } });
      if (!teacher) {
        return [];
      }
      const teacherCourses = await prisma.teacherCourse.findMany({
        where: { teacherId: teacher.id },
        select: { courseId: true },
      });
      const allowedCourseIds = teacherCourses.map((tc: any) => tc.courseId);
      where.courseId = { in: allowedCourseIds };
    }

    return prisma.bookingRequest.findMany({
      where,
      include: {
        course: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, schedule: true, maxCapacity: true } },
        reviewedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getBookingRequestById(bookingId: bigint, reviewerRole: UserRole | string, reviewerUserId: bigint) {
    const booking = await prisma.bookingRequest.findUnique({
      where: { id: bookingId },
      include: {
        course: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, schedule: true, maxCapacity: true } },
        reviewedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    if (!booking) {
      throw new Error('طلب الحجز غير موجود');
    }

    const normalizedRole = reviewerRole ? reviewerRole.toString().toUpperCase() : '';

    // Teacher ownership check
    if (normalizedRole === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({ where: { userId: reviewerUserId } });
      if (!teacher) {
        throw new Error('غير مصرح لك بالوصول لهذا الطلب');
      }
      const isAssigned = await prisma.teacherCourse.findUnique({
        where: { teacherId_courseId: { teacherId: teacher.id, courseId: booking.courseId } },
      });
      if (!isAssigned) {
        throw new Error('غير مصرح لك بالوصول لطلبات حجز كورسات غير معينة لك');
      }
    }

    return booking;
  }

  // 4. Atomic Approval Transaction & Account Creation
  static async approveBookingRequest(bookingId: bigint, reviewerUserId: bigint, reviewerRole: UserRole | string) {
    // A. Pre-check Teacher course ownership before starting transaction
    const bookingToReview = await prisma.bookingRequest.findUnique({ where: { id: bookingId } });
    if (!bookingToReview) {
      throw new Error('طلب الحجز غير موجود');
    }

    const normalizedRole = reviewerRole ? reviewerRole.toString().toUpperCase() : '';

    if (normalizedRole === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({ where: { userId: reviewerUserId } });
      if (!teacher) {
        throw new Error('غير مصرح لك بتعديل هذا الطلب');
      }
      const isAssigned = await prisma.teacherCourse.findUnique({
        where: { teacherId_courseId: { teacherId: teacher.id, courseId: bookingToReview.courseId } },
      });
      if (!isAssigned) {
        throw new Error('غير مصرح لك بالموافقة على طلبات كورس غير معين لك');
      }
    }

    // B. Generate Secure Activation Token & Hash for Student & Parent
    const rawStudentToken = crypto.randomBytes(32).toString('hex');
    const studentTokenHash = crypto.createHash('sha256').update(rawStudentToken).digest('hex');
    const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Valid for 7 days

    let createdStudentUsername = '';
    let isParentNew = false;
    let rawParentToken: string | null = null;
    let createdParentUsername = '';

    // C. Execute Atomic Transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Idempotency & Status Check inside transaction
      const booking = await tx.bookingRequest.findUnique({ where: { id: bookingId } });
      if (!booking || booking.status !== BookingStatus.PENDING) {
        throw new Error('طلب الحجز لم يعد في حالة الانتظار أو تم معالجته بالفعل');
      }

      // 2. Re-check Group Capacity inside transaction
      const group = await tx.group.findUnique({
        where: { id: booking.groupId },
        include: { _count: { select: { groupStudents: true } } },
      });
      if (!group) {
        throw new Error('المجموعة غير موجودة');
      }
      const currentCapacity = group._count.groupStudents;
      if (currentCapacity >= group.maxCapacity) {
        throw new Error('تعذر القبول: اكتمل العدد في هذه المجموعة أثناء الانتظار');
      }

      // 3. Get Active Academic Year
      const activeAcademicYear = await tx.academicYear.findFirst({ where: { isCurrent: true } });
      if (!activeAcademicYear) {
        throw new Error('لم يتم تحديد سنة أكاديمية حالية في النظام');
      }

      // 4. Get Course Details
      const course = await tx.course.findUnique({ where: { id: booking.courseId } });
      if (!course) {
        throw new Error('الكورس غير موجود');
      }

      // 5. Parent Account Creation or Reuse (Matching by parentPhone)
      let parentRecord = await tx.parent.findFirst({
        where: { user: { phone: booking.parentPhone } },
        include: { user: true },
      });

      if (!parentRecord) {
        isParentNew = true;
        rawParentToken = crypto.randomBytes(32).toString('hex');
        const parentTokenHash = crypto.createHash('sha256').update(rawParentToken).digest('hex');

        const parentUsername = booking.parentPhone;
        createdParentUsername = parentUsername;

        const parentUser = await tx.user.create({
          data: {
            username: parentUsername,
            passwordHash: '',
            fullName: booking.parentName,
            role: UserRole.PARENT,
            phone: booking.parentPhone,
            isActive: false,
            activationTokenHash: parentTokenHash,
            activationTokenExpires: tokenExpires,
          },
        });

        parentRecord = await tx.parent.create({
          data: {
            userId: parentUser.id,
            notes: `تم الإنشاء تلقائياً عبر موافقة حجز الدرس (الطالب: ${booking.studentName})`,
          },
          include: { user: true },
        });
      } else {
        isParentNew = false;
        createdParentUsername = parentRecord.user.username;
      }

      // 6. Student Account Creation
      const studentUsername = booking.studentPhone;
      createdStudentUsername = studentUsername;

      // Check if student username or phone already exists
      const existingStudentUser = await tx.user.findFirst({
        where: { OR: [{ username: studentUsername }, { phone: booking.studentPhone }] },
      });

      let studentUser;
      let studentRecord;

      if (existingStudentUser) {
        studentUser = existingStudentUser;
        studentRecord = await tx.student.findUnique({ where: { userId: studentUser.id } });
        if (!studentRecord) {
          studentRecord = await tx.student.create({
            data: {
              userId: studentUser.id,
              parentId: parentRecord.id,
              grade: booking.grade,
            },
          });
        }
      } else {
        studentUser = await tx.user.create({
          data: {
            username: studentUsername,
            passwordHash: '',
            fullName: booking.studentName,
            role: UserRole.STUDENT,
            phone: booking.studentPhone,
            isActive: false,
            activationTokenHash: studentTokenHash,
            activationTokenExpires: tokenExpires,
          },
        });

        studentRecord = await tx.student.create({
          data: {
            userId: studentUser.id,
            parentId: parentRecord.id,
            grade: booking.grade,
          },
        });
      }

      // 7. Course Enrollment (Prevent Duplicate Enrollment)
      let enrollment = await tx.enrollment.findUnique({
        where: { studentId_courseId: { studentId: studentRecord.id, courseId: booking.courseId } },
      });
      if (!enrollment) {
        enrollment = await tx.enrollment.create({
          data: {
            studentId: studentRecord.id,
            courseId: booking.courseId,
            academicYearId: activeAcademicYear.id,
            monthlyFee: course.defaultMonthlyFee,
            status: 'ACTIVE',
          },
        });
      }

      // 8. Add Student to Group
      const existingGroupStudent = await tx.groupStudent.findUnique({
        where: { groupId_studentId: { groupId: booking.groupId, studentId: studentRecord.id } },
      });
      if (!existingGroupStudent) {
        await tx.groupStudent.create({
          data: {
            studentId: studentRecord.id,
            groupId: booking.groupId,
          },
        });
      }

      // 9. Update BookingRequest Status -> APPROVED
      const updatedBooking = await tx.bookingRequest.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.APPROVED,
          reviewedAt: new Date(),
          reviewedById: reviewerUserId,
        },
      });

      return {
        booking: updatedBooking,
        studentId: studentRecord.id,
        studentUserId: studentUser.id,
        parentUserId: parentRecord.user.id,
        isParentNew,
        parentUsername: createdParentUsername,
        rawParentToken,
      };
    });

    // D. Audit Log & Notifications (Outside transaction for performance)
    await AuditLogService.logAction(
      { userId: reviewerUserId, role: normalizedRole as UserRole },
      'BOOKING_APPROVED',
      'BookingRequest',
      bookingId,
      { status: BookingStatus.PENDING },
      { status: BookingStatus.APPROVED, studentUsername: createdStudentUsername }
    );

    await NotificationService.createNotification(
      reviewerUserId,
      'تمت الموافقة على طلب الحجز',
      `تم قبول طلب حجز الطالب ${result.booking.studentName} وإنشاء مقعده في الكورس والمجموعة بنجاح.`,
      NotificationType.SYSTEM
    );

    return {
      success: true,
      message: 'تمت الموافقة على طلب الحجز وإنشاء الحساب والمقعد بنجاح',
      data: {
        booking: result.booking,
        student: {
          username: createdStudentUsername,
          fullName: bookingToReview.studentName,
          activationToken: rawStudentToken,
          activationLink: `/activate?token=${rawStudentToken}`,
        },
        parent: {
          isNew: result.isParentNew,
          username: result.parentUsername,
          fullName: bookingToReview.parentName,
          activationToken: result.isParentNew ? result.rawParentToken : null,
          activationLink: result.isParentNew ? `/activate?token=${result.rawParentToken}` : null,
        },
      },
    };
  }

  // 5. Rejection Flow
  static async rejectBookingRequest(
    bookingId: bigint,
    input: RejectBookingRequestInput,
    reviewerUserId: bigint,
    reviewerRole: UserRole | string
  ) {
    const booking = await prisma.bookingRequest.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw new Error('طلب الحجز غير موجود');
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new Error('طلب الحجز لم يعد في حالة الانتظار');
    }

    const normalizedRole = reviewerRole ? reviewerRole.toString().toUpperCase() : '';

    // Teacher course ownership check
    if (normalizedRole === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({ where: { userId: reviewerUserId } });
      if (!teacher) {
        throw new Error('غير مصرح لك بتعديل هذا الطلب');
      }
      const isAssigned = await prisma.teacherCourse.findUnique({
        where: { teacherId_courseId: { teacherId: teacher.id, courseId: booking.courseId } },
      });
      if (!isAssigned) {
        throw new Error('غير مصرح لك برفض طلبات حجز كورس غير معين لك');
      }
    }

    const updatedBooking = await prisma.bookingRequest.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.REJECTED,
        rejectionReason: input.rejectionReason,
        reviewedAt: new Date(),
        reviewedById: reviewerUserId,
      },
    });

    await AuditLogService.logAction(
      { userId: reviewerUserId, role: normalizedRole as UserRole },
      'BOOKING_REJECTED',
      'BookingRequest',
      bookingId,
      { status: BookingStatus.PENDING },
      { status: BookingStatus.REJECTED, reason: input.rejectionReason }
    );

    return updatedBooking;
  }

  // 6. Account Activation Flow
  static async activateAccount(input: ActivateAccountInput) {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        activationTokenHash: tokenHash,
        activationTokenExpires: { gte: new Date() },
      },
    });

    if (!user) {
      throw new Error('رمز التفعيل غير صحيح أو منتهي الصلاحية');
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

    const activatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        isActive: true,
        activationTokenHash: null,
        activationTokenExpires: null,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    return activatedUser;
  }

  // 7. Get Activation Info for Displaying Name Dynamically
  static async getActivationInfo(token: string) {
    if (!token || token.trim() === '') {
      throw new Error('رمز التفعيل مطلوب');
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        activationTokenHash: tokenHash,
        activationTokenExpires: { gte: new Date() },
      },
      select: {
        fullName: true,
        role: true,
        username: true,
      },
    });

    if (!user) {
      throw new Error('رمز التفعيل غير صحيح أو تم استخدامه من قبل أو منتهي الصلاحية');
    }

    return user;
  }
}
