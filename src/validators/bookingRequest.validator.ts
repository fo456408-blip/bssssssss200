import { z } from 'zod';
import { StudentGrade, LearningMode } from '@prisma/client';

const phoneRegex = /^01[0125][0-9]{8}$/;

export const createBookingRequestSchema = z.object({
  studentName: z
    .string({ required_error: 'اسم الطالب مطلوب' })
    .min(3, { message: 'اسم الطالب يجب أن يكون 3 أحرف على الأقل' })
    .max(100, { message: 'اسم الطالب طويل جداً' }),
  studentPhone: z
    .string({ required_error: 'رقم تليفون الطالب مطلوب' })
    .regex(phoneRegex, { message: 'رقم تليفون الطالب غير صحيح، يجب أن يتكون من 11 رقم ويبدأ بـ 01' }),
  parentName: z
    .string({ required_error: 'اسم ولي الأمر مطلوب' })
    .min(3, { message: 'اسم ولي الأمر يجب أن يكون 3 أحرف على الأقل' })
    .max(100, { message: 'اسم ولي الأمر طويل جداً' }),
  parentPhone: z
    .string({ required_error: 'رقم تليفون ولي الأمر مطلوب' })
    .regex(phoneRegex, { message: 'رقم تليفون ولي الأمر غير صحيح، يجب أن يتكون من 11 رقم ويبدأ بـ 01' }),
  courseId: z
    .union([z.string(), z.number()])
    .transform((val) => BigInt(val)),
  groupId: z
    .union([z.string(), z.number()])
    .transform((val) => BigInt(val)),
  grade: z
    .nativeEnum(StudentGrade)
    .optional()
    .default(StudentGrade.FIRST_SECONDARY),
  learningMode: z
    .nativeEnum(LearningMode)
    .optional()
    .default(LearningMode.IN_PERSON),
  notes: z
    .string()
    .max(500, { message: 'الملاحظات يجب ألا تتجاوز 500 حرف' })
    .optional(),
});

export const rejectBookingRequestSchema = z.object({
  rejectionReason: z
    .string({ required_error: 'سبب الرفض مطلوب' })
    .min(3, { message: 'سبب الرفض يجب أن يكون 3 أحرف على الأقل' }),
});

export const activateAccountSchema = z.object({
  token: z
    .string({ required_error: 'رمز التفعيل مطلوب' })
    .min(10, { message: 'رمز التفعيل غير صحيح' }),
  newPassword: z
    .string({ required_error: 'كلمة المرور الجديدة مطلوبة' })
    .min(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
    .regex(/[A-Z]/, { message: 'كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل (A-Z)' })
    .regex(/[a-z]/, { message: 'كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل (a-z)' })
    .regex(/[0-9]/, { message: 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل (0-9)' }),
});

export type CreateBookingRequestInput = z.input<typeof createBookingRequestSchema>;
export type RejectBookingRequestInput = z.infer<typeof rejectBookingRequestSchema>;
export type ActivateAccountInput = z.infer<typeof activateAccountSchema>;
