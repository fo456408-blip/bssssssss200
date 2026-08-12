import { z } from 'zod';

export const createEnrollmentRequestSchema = z.object({
  fullName: z.string().min(2, 'الاسم بالكامل يجب أن يتكون من حرفين على الأقل'),
  phone: z.string().min(8, 'رقم الهاتف يجب أن يتكون من 8 أرقام على الأقل'),
  email: z.string().email('البريد الإلكتروني غير صالح').optional().or(z.literal('')),
  grade: z.enum(['FIRST_SECONDARY', 'SECOND_SECONDARY'], {
    invalid_type_error: 'يرجى اختيار الصف الدراسي بشكل صحيح',
  }),
  schoolName: z.string().optional().or(z.literal('')),
  course: z.string().min(1, 'يرجى اختيار المادة / الكورس'),
  learningMode: z.enum(['IN_PERSON', 'ONLINE']).default('IN_PERSON'),
  notes: z.string().optional().or(z.literal('')),
});

export const rejectEnrollmentRequestSchema = z.object({
  rejectionReason: z.string().optional(),
});

export type CreateEnrollmentRequestInput = z.infer<typeof createEnrollmentRequestSchema>;
export type RejectEnrollmentRequestInput = z.infer<typeof rejectEnrollmentRequestSchema>;
