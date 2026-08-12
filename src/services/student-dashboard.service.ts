import { prisma } from '../config/database';
import { ApiError } from '../utils/apiError';

export class StudentDashboardService {
  // Helper to resolve student profile from JWT user ID
  static async getStudentByUserId(userId: string | bigint) {
    const student = await prisma.student.findUnique({
      where: { userId: BigInt(userId) },
      include: {
        user: { select: { id: true, username: true, fullName: true, phone: true, email: true } },
        parent: { include: { user: { select: { fullName: true, phone: true } } } },
      },
    });

    if (!student) {
      throw ApiError.notFound('ملف الطالب غير موجود لهذا الحساب');
    }

    return student;
  }

  // 1. GET FULL STUDENT DASHBOARD
  static async getStudentDashboard(userId: string | bigint) {
    const student = await this.getStudentByUserId(userId);
    const studentId = student.id;

    // Get Active Enrollments with Courses & Published Lessons
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      include: {
        academicYear: true,
        course: {
          include: {
            academicYear: true,
            teacherCourses: { include: { teacher: { include: { user: { select: { fullName: true } } } } } },
            lessons: {
              where: { isPublished: true },
              orderBy: { lessonNumber: 'asc' },
            },
          },
        },
      },
    });

    const enrolledCourseIds = enrollments.map((e) => e.courseId);

    // Fetch Student Lesson Progress
    const lessonProgressRecords = await prisma.studentLessonProgress.findMany({
      where: { studentId },
    });
    const progressMap = new Map<string, { isCompleted: boolean; watchedDurationSeconds: number; lastWatchedAt: Date | null }>();
    lessonProgressRecords.forEach((p) => {
      progressMap.set(p.lessonId.toString(), {
        isCompleted: p.isCompleted,
        watchedDurationSeconds: p.watchedDurationSeconds,
        lastWatchedAt: p.lastWatchedAt,
      });
    });

    // Calculate Course Progress and Format Courses
    let totalPublishedLessonsCount = 0;
    let totalCompletedLessonsCount = 0;

    const formattedCourses = enrollments.map((enrollment) => {
      const course = enrollment.course;
      const publishedLessons = course.lessons || [];
      const totalLessons = publishedLessons.length;

      let completedCount = 0;
      let nextLesson: any = null;

      publishedLessons.forEach((lesson) => {
        const prog = progressMap.get(lesson.id.toString());
        if (prog?.isCompleted) {
          completedCount++;
        } else if (!nextLesson) {
          nextLesson = {
            id: lesson.id.toString(),
            lessonNumber: lesson.lessonNumber,
            title: lesson.title,
          };
        }
      });

      totalPublishedLessonsCount += totalLessons;
      totalCompletedLessonsCount += completedCount;

      const courseProgress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
      const teacherName = course.teacherCourses?.[0]?.teacher?.user?.fullName || 'إدارة الأكاديمية';

      return {
        id: course.id.toString(),
        code: course.code,
        name: course.name,
        subject: course.name,
        academicYear: course.academicYear.name,
        teacherName,
        totalLessons,
        completedLessons: completedCount,
        progressPercentage: courseProgress,
        nextLesson,
      };
    });

    const overallCourseProgress =
      totalPublishedLessonsCount > 0 ? Math.round((totalCompletedLessonsCount / totalPublishedLessonsCount) * 100) : 0;

    // 2. ATTENDANCE STATISTICS
    const attendanceStats = await this.getStudentAttendanceSummary(studentId);

    // 3. QUIZ STATISTICS
    const quizStats = await this.getStudentQuizStatistics(studentId, enrolledCourseIds);

    // 4. ASSIGNMENT STATISTICS
    const assignmentStats = await this.getStudentAssignmentStatistics(studentId, enrolledCourseIds);

    // 5. CURRENT MONTH PAYMENT STATUS
    const paymentSummary = await this.getStudentPaymentSummary(studentId);

    // 6. NEXT ACTION RECOMMENDATION
    let nextAction = null;
    const pendingAssignment = assignmentStats.assignmentsList.find(
      (a) => a.submissionStatus === 'PENDING' && a.dueDate && new Date(a.dueDate) < new Date()
    ) || assignmentStats.assignmentsList.find((a) => a.submissionStatus === 'PENDING');

    if (pendingAssignment) {
      nextAction = {
        type: 'ASSIGNMENT',
        title: pendingAssignment.title,
        message: 'لديك واجب مستحق التسليم',
        link: `/student/assignments`,
      };
    } else {
      const activeCourseWithNextLesson = formattedCourses.find((c) => c.nextLesson);
      if (activeCourseWithNextLesson && activeCourseWithNextLesson.nextLesson) {
        nextAction = {
          type: 'LESSON',
          title: activeCourseWithNextLesson.nextLesson.title,
          courseName: activeCourseWithNextLesson.name,
          message: 'تابع من حيث توقفت في الدرس',
          link: `/student/courses/${activeCourseWithNextLesson.id}`,
        };
      } else {
        nextAction = {
          type: 'ALL_SET',
          title: 'أحسنت!',
          message: 'أكملت جميع الدروس والواجبات المتاحة حالياً',
          link: '/student/courses',
        };
      }
    }

    // 7. RECENT ACTIVITY FEED
    const recentActivity = await this.getRecentActivity(studentId);

    // Primary Academic Year Name
    const primaryAcademicYear = enrollments[0]?.academicYear?.name || '2026 / 2027';

    return {
      student: {
        id: student.id.toString(),
        fullName: student.user.fullName,
        username: student.user.username,
        grade: student.grade,
        schoolName: student.schoolName,
        academicYear: primaryAcademicYear,
        phone: student.user.phone,
        email: student.user.email,
      },
      summary: {
        courseProgress: overallCourseProgress,
        attendancePercentage: attendanceStats.attendancePercentage,
        quizAverage: quizStats.quizAverage,
        assignmentsCompleted: assignmentStats.assignmentsCompleted,
        assignmentsTotal: assignmentStats.assignmentsTotal,
        assignmentAverage: assignmentStats.assignmentAverage,
        currentMonthPaymentStatus: paymentSummary.currentMonthPaymentStatus,
      },
      nextAction,
      courses: formattedCourses,
      recentActivity,
    };
  }

  // 2. STUDENT ATTENDANCE SUMMARY
  static async getStudentAttendanceSummary(studentId: bigint) {
    const records = await prisma.attendance.findMany({
      where: {
        studentId,
        session: { status: { not: 'CANCELLED' } },
      },
      include: {
        session: {
          include: { group: { include: { course: true } } },
        },
      },
      orderBy: { markedAt: 'desc' },
    });

    const totalValidSessions = records.length;
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;

    records.forEach((r) => {
      if (r.status === 'PRESENT') presentCount++;
      else if (r.status === 'ABSENT') absentCount++;
      else if (r.status === 'LATE') lateCount++;
      else if (r.status === 'EXCUSED') excusedCount++;
    });

    const validPresentTotal = presentCount + lateCount + excusedCount;
    const attendancePercentage = totalValidSessions > 0 ? Math.round((validPresentTotal / totalValidSessions) * 100) : 100;

    return {
      attendancePercentage,
      totalValidSessions,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      records: records.map((r) => ({
        id: r.id.toString(),
        sessionDate: r.session.sessionDate,
        topic: r.session.topic,
        courseName: r.session.group.course.name,
        groupName: r.session.group.name,
        status: r.status,
        notes: r.notes,
        markedAt: r.markedAt,
      })),
    };
  }

  // 3. STUDENT QUIZ STATISTICS (Average derived from best score per quiz)
  static async getStudentQuizStatistics(studentId: bigint, courseIds?: bigint[]) {
    let targetCourseIds = courseIds;
    if (!targetCourseIds || targetCourseIds.length === 0) {
      const activeEnrollments = await prisma.enrollment.findMany({
        where: { studentId, status: 'ACTIVE' },
        select: { courseId: true },
      });
      targetCourseIds = activeEnrollments.map((e) => e.courseId);
    }

    if (targetCourseIds.length === 0) {
      return {
        totalQuizzes: 0,
        completedQuizzes: 0,
        quizAverage: null,
        quizzes: [],
      };
    }

    const quizzes = await prisma.quiz.findMany({
      where: {
        isPublished: true,
        lesson: { courseId: { in: targetCourseIds }, isPublished: true },
      },
      include: {
        lesson: { include: { course: true } },
        attempts: {
          where: { studentId },
          orderBy: { score: 'desc' },
        },
      },
    });

    let totalQuizzes = quizzes.length;
    let completedQuizzes = 0;
    let sumBestScores = 0;

    const quizList = quizzes.map((quiz) => {
      const attempts = quiz.attempts || [];
      const hasAttempted = attempts.length > 0;
      if (hasAttempted) completedQuizzes++;

      const bestAttempt = attempts[0]; // sorted desc by score
      const bestScore = bestAttempt && bestAttempt.score !== null ? Math.round(bestAttempt.score) : null;

      if (bestScore !== null) {
        sumBestScores += bestScore;
      }

      return {
        id: quiz.id.toString(),
        title: quiz.title,
        courseName: quiz.lesson.course.name,
        lessonTitle: quiz.lesson.title,
        durationMinutes: quiz.durationMinutes,
        passingScore: quiz.passingScore,
        attemptsCount: attempts.length,
        bestScore,
        passed: bestAttempt ? bestAttempt.isPassed : null,
        status: hasAttempted ? (bestAttempt?.isPassed ? 'PASSED' : 'FAILED') : 'NOT_STARTED',
      };
    });

    const quizAverage = completedQuizzes > 0 ? Math.round(sumBestScores / completedQuizzes) : null;

    return {
      totalQuizzes,
      completedQuizzes,
      quizAverage,
      quizzes: quizList,
    };
  }

  // 4. STUDENT ASSIGNMENT STATISTICS (Only graded assignments included in assignmentAverage)
  static async getStudentAssignmentStatistics(studentId: bigint, courseIds?: bigint[]) {
    const assignments = await prisma.assignment.findMany({
      where: {
        isPublished: true,
        ...(courseIds && courseIds.length > 0 ? { lesson: { courseId: { in: courseIds } } } : {}),
      },
      include: {
        lesson: { include: { course: true } },
        studentAssignments: {
          where: { studentId },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    let assignmentsTotal = assignments.length;
    let assignmentsCompleted = 0;
    let lateCount = 0;
    let gradedCount = 0;
    let totalGradedScorePercentage = 0;

    const assignmentsList = assignments.map((assignment) => {
      const sub = assignment.studentAssignments[0];
      const isSubmitted = !!sub;

      if (isSubmitted) {
        assignmentsCompleted++;
        if (sub.status === 'LATE') lateCount++;
        if (sub.status === 'GRADED' && sub.score !== null && sub.score !== undefined) {
          gradedCount++;
          const scorePercent = (Number(sub.score) / Number(assignment.maxScore)) * 100;
          totalGradedScorePercentage += scorePercent;
        }
      }

      return {
        id: assignment.id.toString(),
        title: assignment.title,
        description: assignment.description,
        dueDate: assignment.dueDate,
        maxScore: Number(assignment.maxScore),
        courseName: assignment.lesson.course.name,
        lessonTitle: assignment.lesson.title,
        submissionStatus: sub ? sub.status : 'PENDING',
        score: sub?.score !== null && sub?.score !== undefined ? Number(sub.score) : null,
        feedback: sub?.feedback || null,
        submittedAt: sub?.submittedAt || null,
        gradedAt: sub?.gradedAt || null,
        hasFile: !!sub?.storageKey,
      };
    });

    const assignmentAverage = gradedCount > 0 ? Math.round(totalGradedScorePercentage / gradedCount) : null;

    return {
      assignmentsTotal,
      assignmentsCompleted,
      lateCount,
      gradedCount,
      assignmentAverage,
      assignmentsList,
    };
  }

  // 5. STUDENT PAYMENT SUMMARY
  static async getStudentPaymentSummary(studentId: bigint) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1; // 1-12
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    const currentMonthName = arabicMonths[now.getMonth()];

    const payments = await prisma.payment.findMany({
      where: { enrollment: { studentId } },
      include: {
        enrollment: {
          include: { course: true },
        },
      },
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
    });

    const currentMonthPayment = payments.find((p) => p.billingMonth === currentMonthNum && p.billingYear === currentYear);
    const currentMonthPaymentStatus = currentMonthPayment ? currentMonthPayment.status : 'UNPAID';

    return {
      currentMonth: currentMonthName,
      currentYear,
      currentMonthPaymentStatus,
      currentMonthAmount: currentMonthPayment ? Number(currentMonthPayment.amount) : null,
      history: payments.map((p) => ({
        id: p.id.toString(),
        courseName: p.enrollment.course.name,
        month: arabicMonths[p.billingMonth - 1] || `${p.billingMonth}`,
        year: p.billingYear,
        amount: Number(p.amount),
        status: p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidDate,
      })),
    };
  }

  // 6. RECENT ACTIVITY FEED (Derived strictly from existing records)
  static async getRecentActivity(studentId: bigint) {
    const activityItems: Array<{ type: string; title: string; timestamp: Date; icon: string; link?: string }> = [];

    // A. Video progress updates
    const videoProgresses = await prisma.studentLessonProgress.findMany({
      where: { studentId },
      include: { lesson: { include: { course: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    videoProgresses.forEach((vp) => {
      activityItems.push({
        type: 'VIDEO',
        title: vp.isCompleted
          ? `أكملت مشاهدة درس "${vp.lesson.title}" في كورس ${vp.lesson.course.name}`
          : `شاهدت مقطعاً من درس "${vp.lesson.title}"`,
        timestamp: vp.updatedAt,
        icon: '🎥',
        link: `/student/courses/${vp.lesson.courseId}`,
      });
    });

    // B. Quiz attempts
    const quizAttempts = await prisma.quizAttempt.findMany({
      where: { studentId, status: 'SUBMITTED' },
      include: { quiz: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    quizAttempts.forEach((qa) => {
      if (qa.score !== null) {
        activityItems.push({
          type: 'QUIZ',
          title: `حصلت على ${Math.round(qa.score)}% في اختبار "${qa.quiz.title}" (${qa.isPassed ? 'ناجح ✓' : 'لم تجتاز'})`,
          timestamp: qa.updatedAt,
          icon: '📝',
          link: '/student/quizzes',
        });
      }
    });

    // C. Assignment Submissions & Grading
    const assignmentSubs = await prisma.studentAssignment.findMany({
      where: { studentId },
      include: { assignment: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    assignmentSubs.forEach((sub) => {
      if (sub.status === 'GRADED' && sub.gradedAt) {
        activityItems.push({
          type: 'GRADE',
          title: `تم تصحيح واجب "${sub.assignment.title}" — الدرجة: ${sub.score}/${sub.assignment.maxScore}`,
          timestamp: sub.gradedAt,
          icon: '📚',
          link: '/student/assignments',
        });
      } else if (sub.submittedAt) {
        activityItems.push({
          type: 'SUBMISSION',
          title: `قمت بتسليم واجب "${sub.assignment.title}" بنجاح`,
          timestamp: sub.submittedAt,
          icon: '📤',
          link: '/student/assignments',
        });
      }
    });

    // D. Attendance Records
    const attendanceRecords = await prisma.attendance.findMany({
      where: { studentId },
      include: { session: true },
      orderBy: { markedAt: 'desc' },
      take: 5,
    });

    attendanceRecords.forEach((att) => {
      const statusText = att.status === 'PRESENT' ? 'حاضر' : att.status === 'LATE' ? 'متأخر' : att.status === 'EXCUSED' ? 'معذور' : 'غائب';
      activityItems.push({
        type: 'ATTENDANCE',
        title: `تم تسجيل حضورك بحالة (${statusText}) في حصة ${att.session.topic || ''}`,
        timestamp: att.markedAt,
        icon: '📅',
        link: '/student/attendance',
      });
    });

    // E. Payment Registration
    const payments = await prisma.payment.findMany({
      where: { enrollment: { studentId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    payments.forEach((pay) => {
      if (pay.status === 'PAID' && pay.paidDate) {
        activityItems.push({
          type: 'PAYMENT',
          title: `تم تسديد مصروفات كورس بنجاح (${pay.amount} جنيه)`,
          timestamp: pay.paidDate,
          icon: '💰',
          link: '/student/payments',
        });
      }
    });

    // Sort combined activities by timestamp descending and take top 8
    return activityItems
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }

  // 7. GET STUDENT ENROLLED COURSES & DETAILS
  static async getStudentCourses(userId: string | bigint) {
    const student = await this.getStudentByUserId(userId);
    return this.getStudentDashboard(userId).then((d) => d.courses);
  }

  static async getStudentCourseDetails(userId: string | bigint, courseId: string) {
    const student = await this.getStudentByUserId(userId);
    const courseIdBigInt = BigInt(courseId);

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: student.id, courseId: courseIdBigInt, status: 'ACTIVE' },
      include: {
        course: {
          include: {
            academicYear: true,
            teacherCourses: { include: { teacher: { include: { user: { select: { fullName: true } } } } } },
            lessons: {
              where: { isPublished: true },
              orderBy: { lessonNumber: 'asc' },
              include: {
                quizzes: { where: { isPublished: true } },
                assignments: { where: { isPublished: true } },
              },
            },
          },
        },
      },
    });

    if (!enrollment) {
      throw ApiError.forbidden('غير مصرح لك بالوصول لتفاصيل كورس غير مشترك فيه');
    }

    const course: any = enrollment.course;

    // Fetch video progress records
    const progressList = await prisma.studentLessonProgress.findMany({
      where: { studentId: student.id, lessonId: { in: course.lessons.map((l: any) => l.id) } },
    });
    const progressMap = new Map<string, any>();
    progressList.forEach((p) => progressMap.set(p.lessonId.toString(), p));

    // Fetch quiz attempts
    const quizAttempts = await prisma.quizAttempt.findMany({
      where: { studentId: student.id },
    });
    const quizAttemptsMap = new Map<string, any[]>();
    quizAttempts.forEach((qa) => {
      const qid = qa.quizId.toString();
      if (!quizAttemptsMap.has(qid)) quizAttemptsMap.set(qid, []);
      quizAttemptsMap.get(qid)!.push(qa);
    });

    // Fetch assignment submissions
    const assignmentSubs = await prisma.studentAssignment.findMany({
      where: { studentId: student.id },
    });
    const assignmentSubMap = new Map<string, any>();
    assignmentSubs.forEach((sub) => assignmentSubMap.set(sub.assignmentId.toString(), sub));

    const formattedLessons = course.lessons.map((lesson: any) => {
      const prog = progressMap.get(lesson.id.toString());
      const lessonQuizzes = (lesson.quizzes || []).map((q: any) => {
        const attempts = quizAttemptsMap.get(q.id.toString()) || [];
        const bestScore = attempts.length > 0 ? Math.max(...attempts.map((a: any) => (a.score !== null ? Number(a.score) : 0))) : null;
        return {
          id: q.id.toString(),
          title: q.title,
          passingScore: q.passingScore,
          attemptsCount: attempts.length,
          bestScore,
          passed: attempts.some((a) => a.isPassed),
        };
      });

      const lessonAssignments = (lesson.assignments || []).map((a: any) => {
        const sub = assignmentSubMap.get(a.id.toString());
        return {
          id: a.id.toString(),
          title: a.title,
          dueDate: a.dueDate,
          maxScore: Number(a.maxScore),
          status: sub ? sub.status : 'PENDING',
          score: sub?.score !== null && sub?.score !== undefined ? Number(sub.score) : null,
          feedback: sub?.feedback || null,
        };
      });

      return {
        id: lesson.id.toString(),
        lessonNumber: lesson.lessonNumber,
        title: lesson.title,
        description: lesson.description,
        content: lesson.content,
        isCompleted: prog?.isCompleted || false,
        lastPositionSeconds: prog?.watchedDurationSeconds || 0,
        quizzes: lessonQuizzes,
        assignments: lessonAssignments,
      };
    });

    const completedLessonsCount = formattedLessons.filter((l: any) => l.isCompleted).length;
    const progressPercentage = formattedLessons.length > 0 ? Math.round((completedLessonsCount / formattedLessons.length) * 100) : 0;

    return {
      course: {
        id: course.id.toString(),
        code: course.code,
        name: course.name,
        academicYear: course.academicYear.name,
        teacherName: course.teacherCourses?.[0]?.teacher?.user?.fullName || 'إدارة الأكاديمية',
        totalLessons: formattedLessons.length,
        completedLessons: completedLessonsCount,
        progressPercentage,
      },
      lessons: formattedLessons,
    };
  }
}
