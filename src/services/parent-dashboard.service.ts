import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';
import { StudentDashboardService } from './student-dashboard.service';

export class ParentDashboardService {
  // Helper to resolve parent profile from JWT user ID
  static async getParentByUserId(userId: string | bigint) {
    const parent = await prisma.parent.findUnique({
      where: { userId: BigInt(userId) },
      include: {
        user: { select: { id: true, username: true, fullName: true, phone: true, email: true } },
        students: {
          include: {
            user: { select: { id: true, username: true, fullName: true } },
          },
        },
      },
    });

    if (!parent) {
      throw ApiError.notFound('ملف ولي الأمر غير موجود لهذا الحساب');
    }

    return parent;
  }

  // Security Guard: Verifies student is linked to authenticated parent
  // Prevents IDOR and avoids leaking student existence
  static async verifyChildBelongsToParent(parentUserId: string | bigint, childId: string | bigint) {
    const parent = await this.getParentByUserId(parentUserId);
    const studentId = BigInt(childId);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student || student.parentId === null || student.parentId !== parent.id) {
      throw ApiError.forbidden('غير مصرح لك بالوصول لبيانات هذا الطالب');
    }

    return { parent, student };
  }

  // 1. GET FULL PARENT DASHBOARD
  static async getParentDashboard(parentUserId: string | bigint) {
    const parent = await this.getParentByUserId(parentUserId);
    const children = parent.students;

    const childrenSummaries = await Promise.all(
      children.map(async (child) => {
        const dash = await StudentDashboardService.getStudentDashboard(child.userId);
        return {
          id: child.id.toString(),
          fullName: dash.student.fullName,
          username: dash.student.username,
          grade: dash.student.grade,
          academicYear: dash.student.academicYear,
          courseProgress: dash.summary.courseProgress,
          attendancePercentage: dash.summary.attendancePercentage,
          quizAverage: dash.summary.quizAverage,
          assignmentsCompleted: dash.summary.assignmentsCompleted,
          assignmentsTotal: dash.summary.assignmentsTotal,
          assignmentAverage: dash.summary.assignmentAverage,
          currentMonthPaymentStatus: dash.summary.currentMonthPaymentStatus,
          nextAction: dash.nextAction,
        };
      })
    );

    // Urgent Alerts across all linked children
    const alerts: Array<{ type: string; childName: string; message: string; severity: 'warning' | 'info' | 'error' }> = [];
    childrenSummaries.forEach((child) => {
      if (child.currentMonthPaymentStatus === 'UNPAID' || child.currentMonthPaymentStatus === 'OVERDUE') {
        alerts.push({
          type: 'PAYMENT',
          childName: child.fullName,
          message: `مصروفات الشهر الحالي مستحقة السداد للطالب ${child.fullName}`,
          severity: 'warning',
        });
      }
      if (child.attendancePercentage < 85) {
        alerts.push({
          type: 'ATTENDANCE',
          childName: child.fullName,
          message: `نسبة حضور الطالب ${child.fullName} أصل من 85% (${child.attendancePercentage}%)`,
          severity: 'error',
        });
      }
      if (child.nextAction && child.nextAction.type === 'ASSIGNMENT') {
        alerts.push({
          type: 'ASSIGNMENT',
          childName: child.fullName,
          message: `لدى الطالب ${child.fullName} واجب مستحق التسليم (${child.nextAction.title})`,
          severity: 'info',
        });
      }
    });

    // Recent activity across all children
    const recentActivity = await this.getParentRecentActivity(parentUserId);

    return {
      parent: {
        id: parent.id.toString(),
        fullName: parent.user.fullName,
        username: parent.user.username,
        phone: parent.user.phone,
        email: parent.user.email,
        occupation: parent.occupation,
        childrenCount: children.length,
      },
      children: childrenSummaries,
      alerts,
      recentActivity,
    };
  }

  // 2. GET LINKED CHILDREN LIST
  static async getParentChildren(parentUserId: string | bigint) {
    const dash = await this.getParentDashboard(parentUserId);
    return dash.children;
  }

  // 3. GET CHILD DETAILS OVERVIEW
  static async getChildOverview(parentUserId: string | bigint, childId: string | bigint) {
    const { student } = await this.verifyChildBelongsToParent(parentUserId, childId);
    return StudentDashboardService.getStudentDashboard(student.userId);
  }

  // 4. GET CHILD ENROLLED COURSES
  static async getChildCourses(parentUserId: string | bigint, childId: string | bigint) {
    const { student } = await this.verifyChildBelongsToParent(parentUserId, childId);
    return StudentDashboardService.getStudentCourses(student.userId);
  }

  // 5. GET CHILD COURSE DETAILS (Sanitized: NO video playback/signed URLs or credentials)
  static async getChildCourseDetails(parentUserId: string | bigint, childId: string | bigint, courseId: string) {
    const { student } = await this.verifyChildBelongsToParent(parentUserId, childId);
    const data = await StudentDashboardService.getStudentCourseDetails(student.userId, courseId);

    // Sanitize lessons to ensure NO video URLs, R2 keys, or presigned links are exposed to Parent
    const sanitizedLessons = data.lessons.map((lesson: any) => {
      const { content, ...safeLesson } = lesson;
      return safeLesson;
    });

    return {
      course: data.course,
      lessons: sanitizedLessons,
    };
  }

  // 6. GET CHILD ATTENDANCE
  static async getChildAttendance(parentUserId: string | bigint, childId: string | bigint) {
    const { student } = await this.verifyChildBelongsToParent(parentUserId, childId);
    return StudentDashboardService.getStudentAttendanceSummary(student.id);
  }

  // 7. GET CHILD QUIZZES & RESULTS
  static async getChildQuizzes(parentUserId: string | bigint, childId: string | bigint) {
    const { student } = await this.verifyChildBelongsToParent(parentUserId, childId);
    return StudentDashboardService.getStudentQuizStatistics(student.id);
  }

  // 8. GET CHILD ASSIGNMENTS & TEACHER FEEDBACK
  static async getChildAssignments(parentUserId: string | bigint, childId: string | bigint) {
    const { student } = await this.verifyChildBelongsToParent(parentUserId, childId);
    return StudentDashboardService.getStudentAssignmentStatistics(student.id);
  }

  // 9. GET CHILD PAYMENTS (READ-ONLY)
  static async getChildPayments(parentUserId: string | bigint, childId: string | bigint) {
    const { student } = await this.verifyChildBelongsToParent(parentUserId, childId);
    return StudentDashboardService.getStudentPaymentSummary(student.id);
  }

  // 10. GET PARENT RECENT ACTIVITY FEED (Merged across all linked children)
  static async getParentRecentActivity(parentUserId: string | bigint) {
    const parent = await this.getParentByUserId(parentUserId);
    const children = parent.students;

    const allActivities: Array<{ childName: string; type: string; title: string; timestamp: Date; icon: string }> = [];

    for (const child of children) {
      const childActivities = await StudentDashboardService.getRecentActivity(child.id);
      childActivities.forEach((act) => {
        allActivities.push({
          childName: child.user.fullName,
          type: act.type,
          title: `${child.user.fullName}: ${act.title}`,
          timestamp: act.timestamp,
          icon: act.icon,
        });
      });
    }

    return allActivities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  }
}
