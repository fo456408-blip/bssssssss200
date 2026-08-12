import { z } from 'zod';
import { ApiError } from '../utils/apiError';

// 1. Assignment CRUD Schemas
export const createAssignmentSchema = z.object({
  lessonId: z.string().min(1, 'الدرس مطلوب'),
  title: z.string().min(2, 'عنوان الواجب مطلوب'),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional().or(z.string().min(1)),
  maxScore: z.number().min(1, 'الدرجة العظمى يجب أن تكون أكبر من 0').default(100),
  isPublished: z.boolean().default(true),
});

export const updateAssignmentSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional().or(z.string().min(1)).optional(),
  maxScore: z.number().min(1).optional(),
  isPublished: z.boolean().optional(),
});

// 2. File Upload Presigned URL Request Schema
export const getAssignmentUploadUrlSchema = z.object({
  filename: z.string().min(1, 'اسم الملف مطلوب'),
  fileSize: z.number().positive('حجم الملف يجب أن يكون أكبر من 0'),
  mimeType: z.string().optional(),
});

// 3. Complete R2 Submission Schema
export const completeAssignmentSubmissionSchema = z.object({
  storageKey: z.string().min(1, 'مفتاح التخزين مطلوب'),
  originalFilename: z.string().min(1, 'اسم الملف الأصلي مطلوب'),
  fileSize: z.number().positive('حجم الملف يجب أن يكون أكبر من 0'),
  mimeType: z.string().optional(),
  submissionText: z.string().optional(),
});

// Legacy text/url submission schema
export const submitAssignmentSchema = z.object({
  submissionText: z.string().optional(),
  fileUrl: z.string().optional(),
});

// 4. Teacher Grading Schema
export const gradeSubmissionSchema = z.object({
  score: z.number().min(0, 'الدرجة لا يمكن أن تكون أقل من 0'),
  feedback: z.string().optional(),
});

// File Extension & Size Validation Helper
export const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'txt',
  'png', 'jpg', 'jpeg', 'py', 'js', 'ts', 'cs', 'cpp', 'c', 'java', 'html', 'css'
]);

export const REJECTED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'msi', 'scr', 'com', 'dll'
]);

export function validateFileMetadata(filename: string, fileSize: number) {
  const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
  if (fileSize > MAX_BYTES) {
    throw ApiError.badRequest(`حجم الملف (${(fileSize / (1024 * 1024)).toFixed(1)} MB) يتجاوز الحد الأقصى المسموح به (100 MB)`);
  }

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (REJECTED_EXTENSIONS.has(ext)) {
    throw ApiError.badRequest(`امتداد الملف (.${ext}) غير مسموح به لأسباب أمنية`);
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw ApiError.badRequest(`نوع الملف (.${ext}) غير مدعوم لتسليم الواجبات`);
  }

  return ext;
}
