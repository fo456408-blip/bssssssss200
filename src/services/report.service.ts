import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { ReportPDFService, MonthlyReportPDFData } from './report-pdf.service';
import { R2Service } from './r2.service';
import { AuditLogService } from './audit-log.service';
import { NotificationService } from './notification.service';
import { PaymentStatus, NotificationType, ReportStatus, UserRole } from '@prisma/client';

const TIMEZONE = 'Africa/Cairo';

const MONTH_NAMES_AR: Record<number, string> = {
  1: 'يناير',
  2: 'فبراير',
  3: 'مارس',
  4: 'أبريل',
  5: 'مايو',
  6: 'يونيو',
  7: 'يوليو',
  8: 'أغسطس',
  9: 'سبتمبر',
  10: 'أكتوبر',
  11: 'نوفمبر',
  12: 'ديسمبر',
};

export class ReportService {
  /**
   * Helper to stringify BigInt properties
   */
  private static serialize(data: any): any {
    return JSON.parse(
      JSON.stringify(data, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
  }

  /**
   * Calculates monthly period date boundaries strictly using Africa/Cairo timezone
   */
  static getMonthlyPeriodBoundaries(year: number, month: number) {
    const padMonth = month < 10 ? `0${month}` : `${month}`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const padNextMonth = nextMonth < 10 ? `0${nextMonth}` : `${nextMonth}`;

    // Period Start: YYYY-MM-01T00:00:00.000Z in Africa/Cairo (+02:00 / +03:00)
    const periodStart = new Date(`${year}-${padMonth}-01T00:00:00.000+02:00`);
    const periodEnd = new Date(`${nextYear}-${padNextMonth}-01T00:00:00.000+02:00`);

    return { periodStart, periodEnd, timezone: TIMEZONE };
  }

  /**
   * 1. GENERATE / REGENERATE MONTHLY STUDENT REPORT
   */
  static async generateMonthlyReport(studentId: string, year: number, month: number, adminUserId: string) {
    const student = await prisma.student.findUnique({
      where: { id: BigInt(studentId) },
      include: {
        user: true,
        parent: { include: { user: true } },
        enrollments: { include: { course: { include: { academicYear: true } } } },
      },
    });

    if (!student) throw ApiError.notFound('الطالب غير موجود');

    const activeEnrollment = student.enrollments.find((e) => e.status === 'ACTIVE') || student.enrollments[0];
    if (!activeEnrollment) throw ApiError.badRequest('الطالب غير مسجل في أي كورس حالي');

    const { periodStart, periodEnd } = this.getMonthlyPeriodBoundaries(year, month);

    // Fetch existing report version count
    const existingReports = await prisma.monthlyReport.findMany({
      where: { studentId: student.id, reportMonth: month, reportYear: year },
      orderBy: { version: 'desc' },
    });

    const nextVersion = existingReports.length > 0 ? existingReports[0].version + 1 : 1;

    // --- DOMAIN METRICS CALCULATION ---
    // A. Course Progress & Lessons
    const course = activeEnrollment.course;
    const lessons = await prisma.lesson.findMany({
      where: { courseId: course.id, isPublished: true },
    });
    const totalLessons = lessons.length;

    const completedProgress = await prisma.studentLessonProgress.findMany({
      where: {
        studentId: student.id,
        lessonId: { in: lessons.map((l) => l.id) },
        isCompleted: true,
      },
    });
    const completedLessonsCount = completedProgress.length;
    const courseProgressPercent = totalLessons > 0 ? Math.round((completedLessonsCount / totalLessons) * 100) : 0;

    // B. Quizzes (in month)
    const quizzes = await prisma.quiz.findMany({
      where: { lesson: { courseId: course.id }, isPublished: true },
    });
    const quizAttempts = await prisma.quizAttempt.findMany({
      where: {
        studentId: student.id,
        quizId: { in: quizzes.map((q) => q.id) },
        createdAt: { gte: periodStart, lt: periodEnd },
        status: { in: ['SUBMITTED', 'GRADED'] },
      },
    });

    const totalQuizzes = quizzes.length;
    const completedQuizzes = quizAttempts.length;
    const quizScoreSum = quizAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const quizAveragePercent = completedQuizzes > 0 ? Math.round(quizScoreSum / completedQuizzes) : 0;
    const passedCount = quizAttempts.filter((a) => a.isPassed).length;
    const failedCount = completedQuizzes - passedCount;

    // C. Assignments (graded in month)
    const assignments = await prisma.assignment.findMany({
      where: { lesson: { courseId: course.id }, isPublished: true },
    });
    const submissions = await prisma.studentAssignment.findMany({
      where: {
        studentId: student.id,
        assignmentId: { in: assignments.map((a) => a.id) },
        submittedAt: { gte: periodStart, lt: periodEnd },
      },
    });

    const totalAssignments = assignments.length;
    const submittedCount = submissions.length;

    let lateCount = 0;
    submissions.forEach((s) => {
      const parentAssign = assignments.find((a) => a.id === s.assignmentId);
      if (parentAssign && s.submittedAt && s.submittedAt > parentAssign.dueDate) {
        lateCount++;
      }
    });

    const gradedSubmissions = submissions.filter((s) => s.score !== null && s.score !== undefined);
    const gradedCount = gradedSubmissions.length;

    let assignmentScoreSumPercent = 0;
    gradedSubmissions.forEach((s) => {
      const parentAssign = assignments.find((a) => a.id === s.assignmentId);
      const maxScore = parentAssign?.maxScore || 100;
      assignmentScoreSumPercent += ((s.score || 0) / maxScore) * 100;
    });
    const assignmentAveragePercent = gradedCount > 0 ? Math.round(assignmentScoreSumPercent / gradedCount) : 0;

    // D. Attendance (in month)
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        studentId: student.id,
        session: {
          group: { courseId: course.id },
          sessionDate: { gte: periodStart, lt: periodEnd },
          status: { not: 'CANCELLED' },
        },
      },
    });

    const totalSessions = attendanceRecords.length;
    const presentCount = attendanceRecords.filter((a) => a.status === 'PRESENT').length;
    const lateCountAtt = attendanceRecords.filter((a) => a.status === 'LATE').length;
    const absentCount = attendanceRecords.filter((a) => a.status === 'ABSENT').length;
    const excusedCount = attendanceRecords.filter((a) => a.status === 'EXCUSED').length;

    const validAttended = presentCount + lateCountAtt + excusedCount;
    const attendancePercent = totalSessions > 0 ? Math.round((validAttended / totalSessions) * 100) : 100;

    // E. Payment (in month)
    const payment = await prisma.payment.findFirst({
      where: {
        enrollmentId: activeEnrollment.id,
        billingMonth: month,
        billingYear: year,
      },
    });

    const paymentStatus: PaymentStatus = payment ? payment.status : PaymentStatus.OVERDUE;
    const monthlyFee = Number(activeEnrollment.monthlyFee || course.defaultMonthlyFee);

    // F. Teacher Notes
    const teacherNotes = `تقرير متابعة دراسي رسمي للطالب ${student.user.fullName} لشهر ${MONTH_NAMES_AR[month]} ${year}`;

    // --- COMPILE COMPLETE IMMUTABLE SNAPSHOT ---
    const snapshotPayload: MonthlyReportPDFData = {
      reportTitle: `تقرير الطالب الشهري - ${MONTH_NAMES_AR[month]} ${year}`,
      reportMonthName: MONTH_NAMES_AR[month],
      reportYear: year,
      generatedDateFormatted: new Date().toLocaleDateString('ar-EG'),
      timezone: TIMEZONE,
      student: {
        fullName: student.user.fullName,
        username: student.user.username,
        grade: student.grade,
        academicYear: course.academicYear?.name || '2026/2027',
      },
      period: {
        start: periodStart.toISOString().split('T')[0],
        end: periodEnd.toISOString().split('T')[0],
      },
      summary: {
        courseProgressPercent,
        attendancePercent,
        quizAveragePercent,
        assignmentAveragePercent,
        paymentStatus,
      },
      courses: [
        {
          name: course.name,
          completedLessons: completedLessonsCount,
          totalLessons,
          progressPercent: courseProgressPercent,
        },
      ],
      quizzes: {
        totalQuizzes,
        completedQuizzes,
        averageScorePercent: quizAveragePercent,
        passedCount,
        failedCount,
      },
      assignments: {
        totalAssignments,
        submittedCount,
        lateCount,
        gradedCount,
        averageScorePercent: assignmentAveragePercent,
      },
      attendance: {
        totalSessions,
        presentCount,
        lateCount: lateCountAtt,
        absentCount,
        excusedCount,
        attendancePercent,
      },
      payment: {
        monthlyFee,
        status: paymentStatus,
        paymentDate: payment?.paidDate ? payment.paidDate.toISOString().split('T')[0] : undefined,
        paymentMethod: payment?.paymentMethod || undefined,
      },
      teacherNotes,
    };

    // Save report record in status GENERATING
    const createdReport = await prisma.monthlyReport.create({
      data: {
        studentId: student.id,
        enrollmentId: activeEnrollment.id,
        reportMonth: month,
        reportYear: year,
        version: nextVersion,
        status: ReportStatus.GENERATING,
        attendancePercentage: attendancePercent,
        attendedSessions: presentCount,
        absentSessions: absentCount,
        lateSessions: lateCountAtt,
        quizAverage: quizAveragePercent,
        assignmentScoreAvg: assignmentAveragePercent,
        paymentStatus,
        teacherNotes,
        snapshotData: JSON.stringify(snapshotPayload),
        generatedById: BigInt(adminUserId),
      },
    });

    try {
      // Generate PDF Buffer
      const pdfBuffer = await ReportPDFService.generateMonthlyReportPDF(snapshotPayload);

      // Upload to R2 under reports/{studentId}/{year}/{month}/{reportId}.pdf
      const pdfStorageKey = `reports/${student.id}/${year}/${month}/${createdReport.id}.pdf`;
      const uploadRes = await R2Service.uploadFileBuffer(pdfBuffer, pdfStorageKey, 'application/pdf');

      // Update report to READY
      const finalReport = await prisma.monthlyReport.update({
        where: { id: createdReport.id },
        data: {
          status: ReportStatus.READY,
          pdfStorageKey,
          pdfUrl: uploadRes.fileUrl,
        },
      });

      // Audit Log Entry
      await AuditLogService.logAction(
        { userId: BigInt(adminUserId), role: UserRole.ADMIN },
        nextVersion === 1 ? 'GENERATE_MONTHLY_REPORT' : 'REGENERATE_MONTHLY_REPORT',
        'MONTHLY_REPORT',
        finalReport.id,
        null,
        { studentId: student.id.toString(), month, year, version: nextVersion },
        { pdfStorageKey },
        '127.0.0.1'
      );

      // Parent Notification (Idempotent refKey per report version)
      if (student.parent) {
        const notifRefKey = `report_monthly_${student.id}_${year}_${month}_v${nextVersion}`;
        await NotificationService.createNotification(
          student.parent.userId,
          `تقرير شهري جديد (${MONTH_NAMES_AR[month]} ${year})`,
          `تم إصدار التقرير الشهري الأكاديمي للطالب ${student.user.fullName} لشهر ${MONTH_NAMES_AR[month]} ${year}. يمكنك الاطلاع عليه الآن.`,
          NotificationType.SYSTEM,
          `/parent/children/${student.id}/reports`,
          'MONTHLY_REPORT',
          finalReport.id,
          notifRefKey
        );
      }

      return this.serialize(finalReport);
    } catch (err: any) {
      // Mark FAILED on error
      await prisma.monthlyReport.update({
        where: { id: createdReport.id },
        data: { status: ReportStatus.FAILED },
      });

      throw ApiError.internal(`فشل في إنتاج ملف PDF للتقرير الشهري: ${err.message}`);
    }
  }

  /**
   * 2. GET REPORTS LIST FOR STUDENT (Derived from JWT studentId)
   */
  static async getReportsForStudent(studentUserId: string) {
    const student = await prisma.student.findUnique({ where: { userId: BigInt(studentUserId) } });
    if (!student) throw ApiError.notFound('ملف الطالب غير موجود');

    const reports = await prisma.monthlyReport.findMany({
      where: { studentId: student.id, status: ReportStatus.READY },
      orderBy: [{ reportYear: 'desc' }, { reportMonth: 'desc' }, { version: 'desc' }],
    });

    return this.serialize(reports);
  }

  /**
   * 3. GET REPORTS LIST FOR PARENT LINKED CHILD (IDOR Checked)
   */
  static async getReportsForParent(parentUserId: string, childId: string) {
    const parent = await prisma.parent.findUnique({
      where: { userId: BigInt(parentUserId) },
      include: { students: true },
    });
    if (!parent) throw ApiError.notFound('ملف ولي الأمر غير موجود');

    const isLinked = parent.students.some((s) => s.id.toString() === childId);
    if (!isLinked) {
      throw ApiError.forbidden('غير مصرح لك بالوصول لتقارير طالب غير مرتبط بحسابك');
    }

    const reports = await prisma.monthlyReport.findMany({
      where: { studentId: BigInt(childId), status: ReportStatus.READY },
      orderBy: [{ reportYear: 'desc' }, { reportMonth: 'desc' }, { version: 'desc' }],
    });

    return this.serialize(reports);
  }

  /**
   * 3B. GENERATE / REQUEST MONTHLY REPORT FOR PARENT LINKED CHILD (IDOR Checked)
   */
  static async generateParentChildMonthlyReport(parentUserId: string, childId: string, year: number, month: number) {
    const parent = await prisma.parent.findUnique({
      where: { userId: BigInt(parentUserId) },
      include: { students: true },
    });
    if (!parent) throw ApiError.notFound('ملف ولي الأمر غير موجود');

    const isLinked = parent.students.some((s) => s.id.toString() === childId);
    if (!isLinked) {
      throw ApiError.forbidden('غير مصرح لك بإصدار تقرير طالب غير مرتبط بحسابك');
    }

    return this.generateMonthlyReport(childId, year, month, parentUserId);
  }

  /**
   * 3C. GENERATE / REQUEST MONTHLY REPORT FOR LOGGED-IN STUDENT
   */
  static async generateStudentMonthlyReport(studentUserId: string, year: number, month: number) {
    const student = await prisma.student.findUnique({
      where: { userId: BigInt(studentUserId) },
    });
    if (!student) throw ApiError.notFound('ملف الطالب غير موجود');

    return this.generateMonthlyReport(student.id.toString(), year, month, studentUserId);
  }

  /**
   * 4. GET REPORTS LIST FOR TEACHER (Authorized student check)
   */
  static async getReportsForTeacher(teacherUserId: string, studentId: string) {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: BigInt(teacherUserId) },
      include: { teacherCourses: true },
    });
    if (!teacher) throw ApiError.notFound('ملف المعلم غير موجود');

    const teacherCourseIds = teacher.teacherCourses.map((tc) => tc.courseId);

    // Verify student is enrolled in one of teacher's courses
    const studentEnrollment = await prisma.enrollment.findFirst({
      where: { studentId: BigInt(studentId), courseId: { in: teacherCourseIds } },
    });

    if (!studentEnrollment) {
      throw ApiError.forbidden('غير مصرح لك بالوصول لتقارير طالب غير مسند إليك');
    }

    const reports = await prisma.monthlyReport.findMany({
      where: { studentId: BigInt(studentId), status: ReportStatus.READY },
      orderBy: [{ reportYear: 'desc' }, { reportMonth: 'desc' }, { version: 'desc' }],
    });

    return this.serialize(reports);
  }

  /**
   * 4B. GENERATE / REQUEST MONTHLY REPORT FOR TEACHER ASSIGNED STUDENT (IDOR Checked)
   */
  static async generateTeacherStudentMonthlyReport(teacherUserId: string, studentId: string, year: number, month: number) {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: BigInt(teacherUserId) },
      include: { teacherCourses: true },
    });
    if (!teacher) throw ApiError.notFound('ملف المعلم غير موجود');

    const teacherCourseIds = teacher.teacherCourses.map((tc) => tc.courseId);

    const studentEnrollment = await prisma.enrollment.findFirst({
      where: { studentId: BigInt(studentId), courseId: { in: teacherCourseIds } },
    });

    if (!studentEnrollment) {
      throw ApiError.forbidden('غير مصرح لك بإصدار تقرير طالب غير مسند إليك');
    }

    return this.generateMonthlyReport(studentId, year, month, teacherUserId);
  }

  /**
   * 5. GET ALL REPORTS (Admin Search & Filters)
   */
  static async getAdminReports(page: number = 1, limit: number = 20, studentId?: string, month?: number, year?: number) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (studentId) where.studentId = BigInt(studentId);
    if (month) where.reportMonth = month;
    if (year) where.reportYear = year;

    const [items, total] = await Promise.all([
      prisma.monthlyReport.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: { include: { user: { select: { fullName: true, username: true } } } },
          enrollment: { include: { course: { select: { name: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      prisma.monthlyReport.count({ where }),
    ]);

    return {
      items: this.serialize(items),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * 6. GET SECURE SIGNED GET URL FOR REPORT PDF (IDOR Guard Enforced)
   */
  static async getReportSignedUrl(reportId: string, userId: string, role: string) {
    const report = await prisma.monthlyReport.findUnique({
      where: { id: BigInt(reportId) },
      include: { student: { include: { parent: true } } },
    });

    if (!report) throw ApiError.notFound('التقرير غير موجود');
    if (report.status !== ReportStatus.READY) throw ApiError.badRequest('ملف التقرير غير جاهز للعرض');

    // Security IDOR Authorization Checks
    const normalizedRole = role.toLowerCase();
    if (normalizedRole === 'student') {
      if (report.student.userId.toString() !== userId) {
        throw ApiError.forbidden('غير مصرح لك بالوصول لتقرير طالب آخر');
      }
    } else if (normalizedRole === 'parent') {
      if (!report.student.parent || report.student.parent.userId.toString() !== userId) {
        throw ApiError.forbidden('غير مصرح لك بالوصول لتقرير طالب غير مرتب بحسابك');
      }
    } else if (normalizedRole === 'teacher') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: BigInt(userId) },
        include: { teacherCourses: true },
      });
      const teacherCourseIds = teacher?.teacherCourses.map((tc) => tc.courseId) || [];
      const enrollment = await prisma.enrollment.findFirst({
        where: { studentId: report.studentId, courseId: { in: teacherCourseIds } },
      });
      if (!enrollment) {
        throw ApiError.forbidden('غير مصرح لك بمشاهدة تقرير طالب غير مسند إليك');
      }
    }

    const storageKey = report.pdfStorageKey || `reports/${report.studentId}/${report.reportYear}/${report.reportMonth}/${report.id}.pdf`;

    // Generate short-lived presigned GET URL (15 minutes / 900 seconds)
    const presignedUrl = await R2Service.generateDownloadPresignedUrl(storageKey, 900);

    return {
      reportId: report.id.toString(),
      presignedUrl,
      downloadUrl: `/api/v1/reports/${report.id}/download`,
      expiresIn: 900,
      reportMonth: report.reportMonth,
      reportYear: report.reportYear,
      studentName: report.student.userId.toString(),
      snapshot: report.snapshotData ? JSON.parse(report.snapshotData) : null,
    };
  }

  /**
   * 7. STREAM REPORT PDF BUFFER DIRECTLY (IDOR Guard Enforced)
   */
  static async streamReportPDFBuffer(reportId: string, userId: string, role: string) {
    const report = await prisma.monthlyReport.findUnique({
      where: { id: BigInt(reportId) },
      include: { student: { include: { parent: true, user: true } } },
    });

    if (!report) throw ApiError.notFound('التقرير غير موجود');

    // Security IDOR Authorization Checks
    const normalizedRole = role.toLowerCase();
    if (normalizedRole === 'student') {
      if (report.student.userId.toString() !== userId) {
        throw ApiError.forbidden('غير مصرح لك بالوصول لتقرير طالب آخر');
      }
    } else if (normalizedRole === 'parent') {
      if (!report.student.parent || report.student.parent.userId.toString() !== userId) {
        throw ApiError.forbidden('غير مصرح لك بالوصول لتقرير طالب غير مرتبط بحسابك');
      }
    } else if (normalizedRole === 'teacher') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: BigInt(userId) },
        include: { teacherCourses: true },
      });
      const teacherCourseIds = teacher?.teacherCourses.map((tc) => tc.courseId) || [];
      const enrollment = await prisma.enrollment.findFirst({
        where: { studentId: report.studentId, courseId: { in: teacherCourseIds } },
      });
      if (!enrollment) {
        throw ApiError.forbidden('غير مصرح لك بمشاهدة تقرير طالب غير مسند إليك');
      }
    }

    let snapshotData: MonthlyReportPDFData;
    if (report.snapshotData) {
      snapshotData = JSON.parse(report.snapshotData);
    } else {
      throw ApiError.badRequest('بيانات التقرير غير مكتملة');
    }

    const pdfBuffer = await ReportPDFService.generateMonthlyReportPDF(snapshotData);
    const filename = `EngCode-Monthly-Report-${report.student.user.username}-${report.reportMonth}-${report.reportYear}.pdf`;

    return { pdfBuffer, filename };
  }
}
