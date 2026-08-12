import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { AnnouncementTarget, AnnouncementStatus, NotificationType, UserRole } from '@prisma/client';
import { NotificationService } from './notification.service';

export class AnnouncementService {
  // 1. Create Announcement (Draft or Published)
  static async createAnnouncement(
    adminUserId: bigint | string,
    data: {
      title: string;
      content: string;
      targetAudience: AnnouncementTarget;
      courseId?: bigint | string;
      status?: AnnouncementStatus;
      expiresAt?: Date;
    }
  ) {
    const creatorId = BigInt(adminUserId);

    const announcement = await prisma.announcement.create({
      data: {
        title: data.title,
        content: data.content,
        targetAudience: data.targetAudience,
        courseId: data.courseId ? BigInt(data.courseId) : null,
        status: data.status || AnnouncementStatus.DRAFT,
        createdById: creatorId,
        expiresAt: data.expiresAt || null,
        publishedAt: data.status === AnnouncementStatus.PUBLISHED ? new Date() : null,
      },
    });

    if (announcement.status === AnnouncementStatus.PUBLISHED) {
      await this.dispatchAnnouncementNotifications(announcement);
    }

    return announcement;
  }

  // 2. Publish Draft Announcement & Dispatch Targeted Notifications
  static async publishAnnouncement(adminUserId: bigint | string, announcementId: bigint | string) {
    const aId = BigInt(announcementId);

    const announcement = await prisma.announcement.findUnique({
      where: { id: aId },
    });

    if (!announcement) {
      throw ApiError.notFound('الإعلان غير موجود');
    }

    if (announcement.status === AnnouncementStatus.PUBLISHED) {
      return announcement; // Already published
    }

    const updated = await prisma.announcement.update({
      where: { id: aId },
      data: {
        status: AnnouncementStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await this.dispatchAnnouncementNotifications(updated);
    return updated;
  }

  // 3. Update Existing Announcement
  static async updateAnnouncement(
    announcementId: bigint | string,
    data: {
      title?: string;
      content?: string;
      targetAudience?: AnnouncementTarget;
      courseId?: bigint | string;
      expiresAt?: Date;
    }
  ) {
    const aId = BigInt(announcementId);
    const announcement = await prisma.announcement.findUnique({ where: { id: aId } });
    if (!announcement) throw ApiError.notFound('الإعلان غير موجود');

    return prisma.announcement.update({
      where: { id: aId },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.content ? { content: data.content } : {}),
        ...(data.targetAudience ? { targetAudience: data.targetAudience } : {}),
        ...(data.courseId !== undefined ? { courseId: data.courseId ? BigInt(data.courseId) : null } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt || null } : {}),
      },
    });
  }

  // 3. Resolve Targeted Recipients & Dispatch Notifications (Server-Side Resolution)
  static async dispatchAnnouncementNotifications(announcement: any) {
    let recipientUserIds: bigint[] = [];

    if (announcement.targetAudience === AnnouncementTarget.ALL_STUDENTS) {
      const users = await prisma.user.findMany({
        where: { role: UserRole.STUDENT, isActive: true },
        select: { id: true },
      });
      recipientUserIds = users.map((u) => u.id);
    } else if (announcement.targetAudience === AnnouncementTarget.ALL_PARENTS) {
      const users = await prisma.user.findMany({
        where: { role: UserRole.PARENT, isActive: true },
        select: { id: true },
      });
      recipientUserIds = users.map((u) => u.id);
    } else if (announcement.targetAudience === AnnouncementTarget.ALL_TEACHERS) {
      const users = await prisma.user.findMany({
        where: { role: UserRole.TEACHER, isActive: true },
        select: { id: true },
      });
      recipientUserIds = users.map((u) => u.id);
    } else if (announcement.targetAudience === AnnouncementTarget.COURSE_STUDENTS) {
      if (!announcement.courseId) return;
      const enrollments = await prisma.enrollment.findMany({
        where: { courseId: announcement.courseId, status: 'ACTIVE' },
        include: { student: true },
      });
      recipientUserIds = enrollments.map((e) => e.student.userId);
    } else if (announcement.targetAudience === AnnouncementTarget.COURSE_PARENTS) {
      if (!announcement.courseId) return;
      const enrollments = await prisma.enrollment.findMany({
        where: { courseId: announcement.courseId, status: 'ACTIVE' },
        include: { student: { include: { parent: true } } },
      });
      recipientUserIds = enrollments
        .filter((e) => e.student.parent !== null)
        .map((e) => e.student.parent!.userId);
    }

    if (recipientUserIds.length > 0) {
      await NotificationService.createBulkNotifications(
        recipientUserIds,
        `📢 إعلان: ${announcement.title}`,
        announcement.content,
        NotificationType.ANNOUNCEMENT,
        `/announcements`,
        'ANNOUNCEMENT',
        announcement.id,
        `announcement_pub_${announcement.id}`
      );
    }
  }

  // 4. Get Published Announcements for User View
  static async getAnnouncementsForUser(userId: bigint | string, role: UserRole) {
    const now = new Date();
    const uId = BigInt(userId);

    // Get user's course IDs if student
    let userCourseIds: bigint[] = [];
    if (role === UserRole.STUDENT) {
      const student = await prisma.student.findUnique({ where: { userId: uId } });
      if (student) {
        const enrollments = await prisma.enrollment.findMany({
          where: { studentId: student.id, status: 'ACTIVE' },
          select: { courseId: true },
        });
        userCourseIds = enrollments.map((e) => e.courseId);
      }
    } else if (role === UserRole.PARENT) {
      const parent = await prisma.parent.findUnique({ where: { userId: uId }, include: { students: true } });
      if (parent) {
        const childStudentIds = parent.students.map((s) => s.id);
        const enrollments = await prisma.enrollment.findMany({
          where: { studentId: { in: childStudentIds }, status: 'ACTIVE' },
          select: { courseId: true },
        });
        userCourseIds = enrollments.map((e) => e.courseId);
      }
    }

    const announcements = await prisma.announcement.findMany({
      where: {
        status: AnnouncementStatus.PUBLISHED,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
        AND: [
          {
            OR: [
              ...(role === UserRole.STUDENT
                ? [
                    { targetAudience: AnnouncementTarget.ALL_STUDENTS },
                    ...(userCourseIds.length > 0
                      ? [{ targetAudience: AnnouncementTarget.COURSE_STUDENTS, courseId: { in: userCourseIds } }]
                      : []),
                  ]
                : []),
              ...(role === UserRole.PARENT
                ? [
                    { targetAudience: AnnouncementTarget.ALL_PARENTS },
                    ...(userCourseIds.length > 0
                      ? [{ targetAudience: AnnouncementTarget.COURSE_PARENTS, courseId: { in: userCourseIds } }]
                      : []),
                  ]
                : []),
              ...(role === UserRole.TEACHER ? [{ targetAudience: AnnouncementTarget.ALL_TEACHERS }] : []),
              ...(role === UserRole.ADMIN ? [{ targetAudience: { in: [AnnouncementTarget.ALL_STUDENTS, AnnouncementTarget.ALL_PARENTS, AnnouncementTarget.ALL_TEACHERS] } }] : []),
            ],
          },
        ],
      },
      include: {
        createdBy: { select: { fullName: true } },
        course: { select: { name: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    return announcements.map((a) => ({
      id: a.id.toString(),
      title: a.title,
      content: a.content,
      targetAudience: a.targetAudience,
      courseName: a.course?.name || null,
      createdByName: a.createdBy.fullName,
      publishedAt: a.publishedAt,
    }));
  }

  // 5. Get All Announcements (Admin / Teacher View)
  static async getAdminAnnouncements(userId?: string, role?: string) {
    let where: any = {};

    if (role && role.toLowerCase() === 'teacher' && userId) {
      const { TeacherService } = await import('./teacher.service');
      const assignedCourseIds = await TeacherService.getAssignedCourseIds(userId);
      where = {
        OR: [
          { createdById: BigInt(userId) },
          { courseId: { in: assignedCourseIds } },
        ],
      };
    }

    const list = await prisma.announcement.findMany({
      where,
      include: {
        createdBy: { select: { fullName: true } },
        course: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((a) => ({
      id: a.id.toString(),
      title: a.title,
      content: a.content,
      targetAudience: a.targetAudience,
      status: a.status,
      courseId: a.courseId ? a.courseId.toString() : null,
      courseName: a.course?.name || null,
      createdByName: a.createdBy.fullName,
      publishedAt: a.publishedAt,
      createdAt: a.createdAt,
    }));
  }
}
