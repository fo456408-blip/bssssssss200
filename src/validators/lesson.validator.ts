import { z } from 'zod';

// 1. Lesson Schemas
export const createLessonSchema = z.object({
  courseId: z.string().min(1, 'الكورس مطلوب'),
  lessonNumber: z.number().min(1, 'رقم الدرس يجب أن يكون على الأقل 1'),
  title: z.string().min(2, 'عنوان الدرس مطلوب'),
  description: z.string().optional(),
  content: z.string().optional(),
  isPublished: z.boolean().default(false),
});

export const updateLessonSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  isPublished: z.boolean().optional(),
});

export const reorderLessonsSchema = z.object({
  orders: z.array(
    z.object({
      lessonId: z.string().min(1),
      lessonNumber: z.number().min(1),
    })
  ),
});

// 2. Video Upload & Completion Schemas
export const requestUploadUrlSchema = z.object({
  filename: z.string().min(1, 'اسم الملف مطلوب'),
  contentType: z.string().refine(
    (val) => ['video/mp4', 'video/webm', 'video/quicktime'].includes(val),
    { message: 'نوع الفيديو غير مدعوم. الأنواع المدعومة: MP4, WebM, QuickTime' }
  ),
});

export const completeVideoSchema = z.object({
  storageKey: z.string().min(1, 'مفتاح التخزين مطلوب'),
  title: z.string().min(1, 'عنوان الفيديو مطلوب'),
  durationSeconds: z.number().min(0).default(0),
  fileSizeBytes: z.number().min(0).default(0),
  isPublished: z.boolean().default(true),
});

// 3. Student Progress Schema
export const updateProgressSchema = z.object({
  lastPosition: z.number().min(0, 'موقع المشاهدة يجب أن يكون أكبر من أو يساوي 0'),
  completionPercentage: z.number().min(0).max(100, 'نسبة الإكمال يجب أن تكون بين 0 و 100'),
});
