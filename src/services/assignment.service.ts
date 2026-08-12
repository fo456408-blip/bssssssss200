import { randomUUID } from 'crypto';
import { prisma } from '../config/database';
import { AssignmentRepository } from '../repositories/assignment.repository';
import { ApiError } from '../utils/apiError';
import { R2Service } from '../utils/r2';
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  getAssignmentUploadUrlSchema,
  completeAssignmentSubmissionSchema,
  submitAssignmentSchema,
  gradeSubmissionSchema,
  validateFileMetadata,
} from '../validators/assignment.validator';

export class AssignmentService {
  private static serialize(obj: any): any {
    return JSON.parse(
      JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
  }

  // 1. ASSIGNMENT MANAGEMENT SERVICES
  static async getAssignmentsByLesson(lessonId: string, onlyPublished: boolean = false) {
    const assignments = await AssignmentRepository.findAssignmentsByLesson(BigInt(lessonId), onlyPublished);
    return this.serialize(assignments);
  }

  static async getAssignmentById(id: string) {
    const assignment = await AssignmentRepository.findAssignmentById(BigInt(id));
    if (!assignment) throw ApiError.notFound('الواجب غير موجود');
    return this.serialize(assignment);
  }

  static async createAssignment(input: any) {
    const data = createAssignmentSchema.parse(input);

    const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(data.lessonId) } });
    if (!lesson) throw ApiError.badRequest('الدرس غير موجود');

    const assignment = await prisma.assignment.create({
      data: {
        lessonId: BigInt(data.lessonId),
        title: data.title,
        description: data.description || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : new Date(Date.now() + 86400000 * 7),
        maxScore: data.maxScore,
        isPublished: data.isPublished,
      },
    });

    return this.serialize(assignment);
  }

  static async updateAssignment(id: string, input: any) {
    const data = updateAssignmentSchema.parse(input);

    const assignment = await prisma.assignment.findUnique({ where: { id: BigInt(id) } });
    if (!assignment) throw ApiError.notFound('الواجب غير موجود');

    const updated = await prisma.assignment.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.dueDate !== undefined && data.dueDate !== null && { dueDate: new Date(data.dueDate) }),
        ...(data.maxScore !== undefined && { maxScore: data.maxScore }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
      },
    });

    return this.serialize(updated);
  }

  static async deleteAssignment(id: string) {
    const aId = BigInt(id);
    const assignment = await prisma.assignment.findUnique({ where: { id: aId } });
    if (!assignment) throw ApiError.notFound('الواجب غير موجود');

    await prisma.$transaction(async (tx) => {
      await tx.studentAssignment.deleteMany({ where: { assignmentId: aId } });
      await tx.assignment.delete({ where: { id: aId } });
    });

    return { message: 'تم حذف الواجب وكافة التسليمات بنجاح' };
  }

  // 2. R2 PRESIGNED FILE UPLOAD FLOW
  static async getUploadUrl(assignmentId: string, studentId: string, input: any) {
    const { filename, fileSize, mimeType } = getAssignmentUploadUrlSchema.parse(input);

    // Validate Extension & File Size (<= 100 MB, executable rejection)
    const ext = validateFileMetadata(filename, fileSize);

    const assignment = await AssignmentRepository.findAssignmentById(BigInt(assignmentId));
    if (!assignment) throw ApiError.notFound('الواجب غير موجود');

    // Security Checks
    if (!assignment.isPublished || !assignment.lesson.isPublished) {
      throw ApiError.forbidden('هذا الواجب غير متاح حالياً (غير منشور)');
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: BigInt(studentId), courseId: assignment.lesson.courseId, status: 'ACTIVE' },
    });
    if (!enrollment) {
      throw ApiError.forbidden('غير مصرح لك برفع واجب كورس غير مشترك فيه');
    }

    // Generate Backend-Controlled Storage Key
    const uuid = randomUUID();
    const storageKey = `assignments/${assignmentId}/students/${studentId}/${uuid}.${ext}`;
    const contentType = mimeType || 'application/octet-stream';

    const uploadUrl = await R2Service.generateUploadPresignedUrl(storageKey, contentType);

    return {
      uploadUrl,
      storageKey,
      expiresIn: 900,
    };
  }

  static async completeR2Submission(assignmentId: string, studentId: string, input: any) {
    const data = completeAssignmentSubmissionSchema.parse(input);

    // Validate File Metadata again on complete endpoint
    validateFileMetadata(data.originalFilename, data.fileSize);

    const expectedNamespace = `assignments/${assignmentId}/students/${studentId}/`;
    if (!data.storageKey.startsWith(expectedNamespace)) {
      throw ApiError.forbidden('مفتاح التخزين لا ينتمي لـ هذا الواجب أو الطالب المحدد');
    }

    const assignment = await AssignmentRepository.findAssignmentById(BigInt(assignmentId));
    if (!assignment) throw ApiError.notFound('الواجب غير موجود');

    if (!assignment.isPublished || !assignment.lesson.isPublished) {
      throw ApiError.forbidden('هذا الواجب غير متاح حالياً (غير منشور)');
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: BigInt(studentId), courseId: assignment.lesson.courseId, status: 'ACTIVE' },
    });
    if (!enrollment) {
      throw ApiError.forbidden('غير مصرح لك بتسليم واجب كورس غير مشترك فيه');
    }

    const now = new Date();
    const isLate = assignment.dueDate ? now > new Date(assignment.dueDate) : false;
    const submissionStatus = isLate ? 'LATE' : 'SUBMITTED';

    const submission = await prisma.studentAssignment.upsert({
      where: {
        studentId_assignmentId: {
          studentId: BigInt(studentId),
          assignmentId: BigInt(assignmentId),
        },
      },
      update: {
        storageKey: data.storageKey,
        originalFilename: data.originalFilename,
        fileSizeBytes: BigInt(data.fileSize),
        mimeType: data.mimeType || 'application/octet-stream',
        submissionText: data.submissionText || null,
        fileUrl: null, // R2 storage key used instead of permanent URL
        status: submissionStatus,
        submittedAt: now,
      },
      create: {
        studentId: BigInt(studentId),
        assignmentId: BigInt(assignmentId),
        storageKey: data.storageKey,
        originalFilename: data.originalFilename,
        fileSizeBytes: BigInt(data.fileSize),
        mimeType: data.mimeType || 'application/octet-stream',
        submissionText: data.submissionText || null,
        fileUrl: null,
        status: submissionStatus,
        submittedAt: now,
      },
    });

    return this.serialize(submission);
  }

  // Legacy/fallback text submission
  static async submitAssignment(assignmentId: string, studentId: string, input: any) {
    const data = submitAssignmentSchema.parse(input);

    const assignment = await AssignmentRepository.findAssignmentById(BigInt(assignmentId));
    if (!assignment) throw ApiError.notFound('الواجب غير موجود');

    if (!assignment.isPublished || !assignment.lesson.isPublished) {
      throw ApiError.forbidden('هذا الواجب غير متاح حالياً (غير منشور)');
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: BigInt(studentId), courseId: assignment.lesson.courseId, status: 'ACTIVE' },
    });
    if (!enrollment) {
      throw ApiError.forbidden('غير مصرح لك بتسليم واجب كورس غير مشترك فيه');
    }

    const now = new Date();
    const isLate = assignment.dueDate ? now > new Date(assignment.dueDate) : false;
    const submissionStatus = isLate ? 'LATE' : 'SUBMITTED';

    const submission = await prisma.studentAssignment.upsert({
      where: {
        studentId_assignmentId: {
          studentId: BigInt(studentId),
          assignmentId: BigInt(assignmentId),
        },
      },
      update: {
        submissionText: data.submissionText || null,
        fileUrl: data.fileUrl || null,
        status: submissionStatus,
        submittedAt: now,
      },
      create: {
        studentId: BigInt(studentId),
        assignmentId: BigInt(assignmentId),
        submissionText: data.submissionText || null,
        fileUrl: data.fileUrl || null,
        status: submissionStatus,
        submittedAt: now,
      },
    });

    return this.serialize(submission);
  }

  // 3. SECURE FILE ACCESS ENDPOINT
  static async getSubmissionFileUrl(submissionId: string, user: { userId: bigint; role: string }) {
    const submission = await prisma.studentAssignment.findUnique({
      where: { id: BigInt(submissionId) },
      include: {
        student: true,
        assignment: { include: { lesson: true } },
      },
    });
    if (!submission) throw ApiError.notFound('تسليم الواجب غير موجود');

    // Role-based Access Authorization
    if (user.role === 'student') {
      const studentProfile = await prisma.student.findUnique({ where: { userId: user.userId } });
      if (!studentProfile || studentProfile.id.toString() !== submission.studentId.toString()) {
        throw ApiError.forbidden('غير مصرح لك بقراءة ملف تسليم طالب آخر');
      }
    } else if (user.role === 'teacher') {
      const teacherProfile = await prisma.teacher.findUnique({ where: { userId: user.userId } });
      if (!teacherProfile) throw ApiError.forbidden('ملف المعلم غير موجود');

      // Verify teacher assigned to course
      const isAssigned = await prisma.teacherCourse.findFirst({
        where: { teacherId: teacherProfile.id, courseId: submission.assignment.lesson.courseId },
      });
      if (!isAssigned) {
        throw ApiError.forbidden('غير مصرح لك بالوصول لملفات واجب كورس غير مسند إليك');
      }
    } else if (user.role === 'parent') {
      throw ApiError.forbidden('غير مصرح لأولياء الأمور بتحميل ملفات التسليمات المباشرة');
    } else if (user.role !== 'admin') {
      throw ApiError.forbidden('غير مصرح لك بالوصول لملف التسليم');
    }

    if (!submission.storageKey) {
      if (submission.fileUrl) {
        return { fileUrl: submission.fileUrl, originalFilename: submission.originalFilename || 'submission_file' };
      }
      throw ApiError.notFound('لا يوجد ملف مرفق لهذا التسليم');
    }

    // Generate Short-Lived Presigned GET URL (15 mins)
    const downloadUrl = await R2Service.generateDownloadPresignedUrl(submission.storageKey);

    return {
      downloadUrl,
      originalFilename: submission.originalFilename || 'submission_file',
      expiresIn: 900,
    };
  }

  static async getStudentSubmission(assignmentId: string, studentId: string) {
    const submission = await AssignmentRepository.findSubmission(BigInt(studentId), BigInt(assignmentId));
    if (!submission) {
      return {
        assignmentId,
        studentId,
        status: 'PENDING',
        submissionText: null,
        fileUrl: null,
      };
    }
    return this.serialize(submission);
  }

  // 4. TEACHER GRADING FLOW
  static async gradeSubmission(submissionId: string, teacherUserId: string, input: any) {
    const data = gradeSubmissionSchema.parse(input);

    const submission = await prisma.studentAssignment.findUnique({
      where: { id: BigInt(submissionId) },
      include: { assignment: { include: { lesson: true } } },
    });
    if (!submission) throw ApiError.notFound('تسليم الواجب غير موجود');

    // Verify Teacher assigned to course if role is teacher
    const user = await prisma.user.findUnique({ where: { id: BigInt(teacherUserId) } });
    if (user?.role.toLowerCase() === 'teacher') {
      const teacherProfile = await prisma.teacher.findUnique({ where: { userId: BigInt(teacherUserId) } });
      const isAssigned = await prisma.teacherCourse.findFirst({
        where: { teacherId: teacherProfile?.id, courseId: submission.assignment.lesson.courseId },
      });
      if (!isAssigned) {
        throw ApiError.forbidden('غير مصرح لك بـ تقييم واجب كورس غير مسند إليك');
      }
    }

    if (data.score > submission.assignment.maxScore) {
      throw ApiError.badRequest(`الدرجة الممنوحة (${data.score}) تتجاوز الدرجة العظمى للواجب (${submission.assignment.maxScore})`);
    }

    const graded = await prisma.studentAssignment.update({
      where: { id: BigInt(submissionId) },
      data: {
        score: data.score,
        feedback: data.feedback || null,
        status: 'GRADED',
        gradedAt: new Date(),
      },
    });

    return this.serialize(graded);
  }

  static async getSubmissionsForAssignment(assignmentId: string) {
    const submissions = await AssignmentRepository.findSubmissionsByAssignment(BigInt(assignmentId));
    return this.serialize(submissions);
  }
}
