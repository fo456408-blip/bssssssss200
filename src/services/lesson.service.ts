import { prisma } from '../config/database';
import { LessonRepository } from '../repositories/lesson.repository';
import { ApiError } from '../utils/apiError';
import { R2Service } from '../utils/r2';
import {
  createLessonSchema,
  updateLessonSchema,
  reorderLessonsSchema,
  requestUploadUrlSchema,
  completeVideoSchema,
  updateProgressSchema,
} from '../validators/lesson.validator';
import crypto from 'crypto';

export class LessonService {
  private static serialize(obj: any): any {
    return JSON.parse(
      JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    );
  }

  // 1. LESSON MANAGEMENT SERVICES
  static async getLessonsByCourse(courseId: string, onlyPublished: boolean = false) {
    const lessons = await LessonRepository.findLessonsByCourse(BigInt(courseId), onlyPublished);
    return this.serialize(lessons);
  }

  static async getLessonById(id: string) {
    const lesson = await LessonRepository.findLessonById(BigInt(id));
    if (!lesson) throw ApiError.notFound('الدرس غير موجود');
    return this.serialize(lesson);
  }

  static async createLesson(input: any) {
    const data = createLessonSchema.parse(input);

    const course = await prisma.course.findUnique({ where: { id: BigInt(data.courseId) } });
    if (!course) throw ApiError.badRequest('الكورس غير موجود');

    // Check duplicate lesson number within course
    const existing = await prisma.lesson.findUnique({
      where: {
        courseId_lessonNumber: {
          courseId: BigInt(data.courseId),
          lessonNumber: data.lessonNumber,
        },
      },
    });
    if (existing) {
      throw ApiError.badRequest(`الدرس رقم ${data.lessonNumber} موجود بالفعل في هذا الكورس`);
    }

    const lesson = await prisma.lesson.create({
      data: {
        courseId: BigInt(data.courseId),
        lessonNumber: data.lessonNumber,
        title: data.title,
        description: data.description || null,
        content: data.content || null,
        isPublished: data.isPublished,
      },
    });

    return this.serialize(lesson);
  }

  static async updateLesson(id: string, input: any) {
    const data = updateLessonSchema.parse(input);
    const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(id) } });
    if (!lesson) throw ApiError.notFound('الدرس غير موجود');

    const updated = await prisma.lesson.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
      },
    });

    return this.serialize(updated);
  }

  static async reorderLessons(courseId: string, input: any) {
    const { orders } = reorderLessonsSchema.parse(input);

    await prisma.$transaction(async (tx) => {
      for (const item of orders) {
        await tx.lesson.update({
          where: { id: BigInt(item.lessonId) },
          data: { lessonNumber: item.lessonNumber },
        });
      }
    });

    return this.getLessonsByCourse(courseId);
  }

  // 2. CLOUDFLARE R2 UPLOAD & COMPLETION FLOW
  static async requestVideoUploadUrl(lessonId: string, input: any) {
    const { filename, contentType } = requestUploadUrlSchema.parse(input);
    const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(lessonId) } });
    if (!lesson) throw ApiError.notFound('الدرس غير موجود');

    // Generate safe unique storage key: courses/{courseId}/lessons/{lessonId}/{randomHex}.mp4
    const fileExt = filename.split('.').pop() || 'mp4';
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const storageKey = `courses/${lesson.courseId.toString()}/lessons/${lessonId}/${uniqueId}.${fileExt}`;

    const uploadUrl = await R2Service.generateUploadPresignedUrl(storageKey, contentType, 900); // 15 mins

    return {
      lessonId,
      storageKey,
      uploadUrl,
      expiresIn: 900,
    };
  }

  static async completeVideoUpload(lessonId: string, input: any) {
    const data = completeVideoSchema.parse(input);
    const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(lessonId) } });
    if (!lesson) throw ApiError.notFound('الدرس غير موجود');

    // Clean key: strip query string or presigned parameters if passed
    let cleanStorageKey = data.storageKey;
    if (cleanStorageKey.includes('?')) {
      cleanStorageKey = cleanStorageKey.split('?')[0];
    }
    if (cleanStorageKey.startsWith('http://') || cleanStorageKey.startsWith('https://')) {
      try {
        const urlObj = new URL(cleanStorageKey);
        cleanStorageKey = urlObj.pathname.replace(/^\//, '');
      } catch (e) {}
    }

    // Security check: verify storage key format matches expected lesson structure
    if (!cleanStorageKey.startsWith(`courses/${lesson.courseId.toString()}/lessons/${lessonId}/`)) {
      throw ApiError.badRequest('مفتاح التخزين غير صالح لـ هذا الدرس');
    }

    const video = await prisma.lessonVideo.create({
      data: {
        lessonId: BigInt(lessonId),
        title: data.title,
        r2StorageKey: cleanStorageKey,
        durationSeconds: data.durationSeconds || 0,
      },
    });

    return this.serialize(video);
  }

  // 3. SECURE VIDEO ACCESS & PRESIGNED GET URL GENERATION
  static async getSecureVideoAccess(videoId: string, userId: string, userRole: string) {
    const video = await LessonRepository.findVideoById(BigInt(videoId));
    if (!video) throw ApiError.notFound('الفيديو غير موجود');

    const lesson = video.lesson;
    const courseId = lesson.courseId;

    // Admin has full access
    if (userRole === 'admin') {
      const presignedUrl = await R2Service.generateDownloadPresignedUrl(video.r2StorageKey, 900);
      return { videoId, presignedUrl, expiresIn: 900, title: video.title };
    }

    // Teacher authorization: must teach course
    if (userRole === 'teacher') {
      const teacherProfile = await prisma.teacher.findUnique({ where: { userId: BigInt(userId) } });
      if (!teacherProfile) throw ApiError.forbidden('ملف المعلم غير موجود');

      const isAssigned = await prisma.teacherCourse.findFirst({
        where: { courseId, teacherId: teacherProfile.id },
      });
      if (!isAssigned) {
        throw ApiError.forbidden('غير مصرح لك بمشاهدة فيديو كورس غير مسند إليك');
      }

      const presignedUrl = await R2Service.generateDownloadPresignedUrl(video.r2StorageKey, 900);
      return { videoId, presignedUrl, expiresIn: 900, title: video.title };
    }

    // Student authorization:
    if (userRole === 'student') {
      const studentProfile = await prisma.student.findUnique({ where: { userId: BigInt(userId) } });
      if (!studentProfile) throw ApiError.forbidden('ملف الطالب غير موجود');

      // 1. Verify active enrollment in course
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentId: studentProfile.id,
          courseId,
          status: 'ACTIVE',
        },
      });

      if (!enrollment) {
        throw ApiError.forbidden('يجب أن تكون مشتركاً بنشاط في هذا الكورس لمشاهدة الفيديو');
      }

      // 2. Verify lesson is published
      if (!lesson.isPublished) {
        throw ApiError.forbidden('هذا الدرس غير متاح حالياً (مسودة)');
      }

      const presignedUrl = await R2Service.generateDownloadPresignedUrl(video.r2StorageKey, 900); // 15 mins
      return { videoId, presignedUrl, expiresIn: 900, title: video.title };
    }

    throw ApiError.forbidden('غير مصرح لك بالوصول لمحتوى الفيديو');
  }

  // 4. STUDENT LESSON PROGRESS TRACKING
  static async getStudentProgress(studentId: string, lessonId: string) {
    const progress = await LessonRepository.findProgress(BigInt(studentId), BigInt(lessonId));
    if (!progress) {
      return {
        studentId,
        lessonId,
        isCompleted: false,
        watchedDurationSeconds: 0,
      };
    }
    return this.serialize(progress);
  }

  static async updateStudentProgress(studentId: string, lessonId: string, input: any) {
    const { lastPosition, completionPercentage } = updateProgressSchema.parse(input);

    const lesson = await prisma.lesson.findUnique({ where: { id: BigInt(lessonId) } });
    if (!lesson) throw ApiError.notFound('الدرس غير موجود');

    // Completion Rule: completionPercentage >= 90 marks lesson completed
    const isCompleted = completionPercentage >= 90;

    const progress = await prisma.studentLessonProgress.upsert({
      where: {
        studentId_lessonId: {
          studentId: BigInt(studentId),
          lessonId: BigInt(lessonId),
        },
      },
      update: {
        watchedDurationSeconds: Math.floor(lastPosition),
        isCompleted,
        lastWatchedAt: new Date(),
      },
      create: {
        studentId: BigInt(studentId),
        lessonId: BigInt(lessonId),
        watchedDurationSeconds: Math.floor(lastPosition),
        isCompleted,
        lastWatchedAt: new Date(),
      },
    });

    return this.serialize(progress);
  }
}
