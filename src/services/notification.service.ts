import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { NotificationType } from '@prisma/client';

export class NotificationService {
  // Create single notification with optional idempotency refKey to prevent duplicates
  static async createNotification(
    userId: bigint | string,
    title: string,
    message: string,
    type: NotificationType = NotificationType.SYSTEM,
    link?: string,
    entityType?: string,
    entityId?: bigint | string,
    refKey?: string
  ) {
    const targetUserId = BigInt(userId);

    // Duplicate prevention / idempotency check
    if (refKey) {
      const existing = await prisma.notification.findUnique({
        where: { refKey },
      });
      if (existing) {
        return existing; // Skip creating duplicate
      }
    }

    return prisma.notification.create({
      data: {
        userId: targetUserId,
        title,
        message,
        type,
        link: link || null,
        entityType: entityType || null,
        entityId: entityId ? BigInt(entityId) : null,
        refKey: refKey || null,
      },
    });
  }

  // Create bulk notifications with idempotency
  static async createBulkNotifications(
    userIds: Array<bigint | string>,
    title: string,
    message: string,
    type: NotificationType = NotificationType.SYSTEM,
    link?: string,
    entityType?: string,
    entityId?: bigint | string,
    refKeyPrefix?: string
  ) {
    const uniqueUserIds = Array.from(new Set(userIds.map((id) => id.toString())));

    const createdNotifications = [];
    for (const uid of uniqueUserIds) {
      const refKey = refKeyPrefix ? `${refKeyPrefix}_${uid}` : undefined;
      try {
        const notif = await this.createNotification(uid, title, message, type, link, entityType, entityId, refKey);
        createdNotifications.push(notif);
      } catch (err) {
        // Continue loop if duplicate constraint trips
      }
    }
    return createdNotifications;
  }

  // Get user notifications (Derived strictly from JWT user ID)
  static async getUserNotifications(userId: bigint | string, unreadOnly: boolean = false) {
    const uId = BigInt(userId);
    return prisma.notification.findMany({
      where: {
        userId: uId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Get unread notification count
  static async getUnreadCount(userId: bigint | string) {
    const uId = BigInt(userId);
    const count = await prisma.notification.count({
      where: { userId: uId, isRead: false },
    });
    return count;
  }

  // Mark single notification as read (Strict recipient boundary check)
  static async markAsRead(userId: bigint | string, notificationId: bigint | string) {
    const uId = BigInt(userId);
    const nId = BigInt(notificationId);

    const notif = await prisma.notification.findUnique({
      where: { id: nId },
    });

    if (!notif) {
      throw ApiError.notFound('الإشعار غير موجود');
    }

    if (notif.userId !== uId) {
      throw ApiError.forbidden('غير مصرح لك بتعديل هذا الإشعار');
    }

    return prisma.notification.update({
      where: { id: nId },
      data: { isRead: true },
    });
  }

  // Mark all user notifications as read
  static async markAllAsRead(userId: bigint | string) {
    const uId = BigInt(userId);
    return prisma.notification.updateMany({
      where: { userId: uId, isRead: false },
      data: { isRead: true },
    });
  }

  // --- AUTOMATIC EVENT TRIGGER HELPERS ---

  // Trigger: Assignment Graded
  static async notifyOnAssignmentGraded(studentId: bigint, assignmentTitle: string, score: number, maxScore: number, assignmentId: bigint) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true, parent: { include: { user: true } } },
    });

    if (!student) return;

    // Student notification
    const studentRefKey = `assign_graded_std_${assignmentId}_${studentId}_${score}`;
    await this.createNotification(
      student.userId,
      'تم تصحيح الواجب',
      `تم تصحيح واجب "${assignmentTitle}" — الدرجة: ${score} من ${maxScore}`,
      NotificationType.ASSIGNMENT,
      `/student/assignments`,
      'ASSIGNMENT',
      assignmentId,
      studentRefKey
    );

    // Parent notification (if student has linked parent)
    if (student.parent && student.parent.userId) {
      const parentRefKey = `assign_graded_prt_${assignmentId}_${studentId}_${score}`;
      await this.createNotification(
        student.parent.userId,
        'تصحيح واجب الطالب',
        `تم تصحيح واجب الطالب ${student.user.fullName} في "${assignmentTitle}" — الدرجة: ${score} من ${maxScore}`,
        NotificationType.ASSIGNMENT,
        `/parent/children`,
        'ASSIGNMENT',
        assignmentId,
        parentRefKey
      );
    }
  }

  // Trigger: Quiz Published
  static async notifyOnQuizPublished(courseId: bigint, quizTitle: string, quizId: bigint) {
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId, status: 'ACTIVE' },
      include: { student: true },
    });

    const studentUserIds = enrollments.map((e) => e.student.userId);
    await this.createBulkNotifications(
      studentUserIds,
      'اختبار جديد متاح',
      `تم نشر اختبار جديد "${quizTitle}" في الكورس. يمكنك التقدم الآن.`,
      NotificationType.QUIZ,
      `/student/quizzes`,
      'QUIZ',
      quizId,
      `quiz_pub_${quizId}`
    );
  }

  // Trigger: Lesson Published
  static async notifyOnLessonPublished(courseId: bigint, lessonTitle: string, lessonId: bigint) {
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId, status: 'ACTIVE' },
      include: { student: true },
    });

    const studentUserIds = enrollments.map((e) => e.student.userId);
    await this.createBulkNotifications(
      studentUserIds,
      'درس جديد متاح',
      `تم نشر درس جديد "${lessonTitle}". يمكنك الآن مشاهدة الشرح والتطبيقات.`,
      NotificationType.LESSON,
      `/student/courses/${courseId}`,
      'LESSON',
      lessonId,
      `lesson_pub_${lessonId}`
    );
  }

  // Trigger: Absence Marked
  static async notifyOnAbsenceMarked(studentId: bigint, sessionTopic: string, sessionId: bigint) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true, parent: { include: { user: true } } },
    });

    if (!student || !student.parent) return;

    const refKey = `absence_marked_${sessionId}_${studentId}`;
    await this.createNotification(
      student.parent.userId,
      'تنبيه غياب طالب',
      `تم تسجيل غياب الطالب ${student.user.fullName} في حصة "${sessionTopic || 'الحصة الأكاديمية'}"`,
      NotificationType.ATTENDANCE,
      `/parent/children`,
      'ATTENDANCE',
      sessionId,
      refKey
    );
  }

  // Trigger: Payment Recorded
  static async notifyOnPaymentRecorded(studentId: bigint, monthName: string, amount: number, paymentId: bigint) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true, parent: { include: { user: true } } },
    });

    if (!student || !student.parent) return;

    const refKey = `payment_rec_${paymentId}`;
    await this.createNotification(
      student.parent.userId,
      'تسجيل سداد المصروفات',
      `تم تسجيل دفع مصروفات شهر ${monthName} بنجاح بمبلغ (${amount} جنيه) للطالب ${student.user.fullName}`,
      NotificationType.PAYMENT,
      `/parent/children`,
      'PAYMENT',
      paymentId,
      refKey
    );
  }
}
