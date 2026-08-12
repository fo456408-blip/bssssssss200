import { z } from 'zod';

// 1. Class Session Schemas
export const createSessionSchema = z.object({
  groupId: z.string().min(1, 'المجموعة مطلوبة'),
  lessonId: z.string().optional(),
  sessionDate: z.string().min(1, 'تاريخ الحصة مطلوب'),
  topic: z.string().optional(),
  notes: z.string().optional(),
});

export const updateSessionSchema = z.object({
  lessonId: z.string().optional(),
  sessionDate: z.string().optional(),
  topic: z.string().optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
});

// 2. Attendance Schemas
export const attendanceRecordSchema = z.object({
  studentId: z.string().min(1, 'الطالب مطلوب'),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  notes: z.string().nullable().optional(),
});

export const bulkAttendanceSchema = z.object({
  attendance: z.array(attendanceRecordSchema),
});

// 3. Payment Schemas
export const createPaymentSchema = z.object({
  enrollmentId: z.string().min(1, 'الاشتراك مطلوب'),
  billingMonth: z.number().min(1).max(12, 'الشهر يجب أن يكون بين 1 و 12'),
  billingYear: z.number().min(2020).max(2100, 'السنة غير صالحة'),
  amount: z.number().min(0, 'المبلغ يجب أن يكون أكبر من أو يساوي 0'),
  status: z.enum(['PAID', 'PENDING', 'OVERDUE', 'PARTIAL', 'CANCELLED']).default('PAID'),
  paymentMethod: z.enum(['CASH', 'INSTAPAY', 'BANK_TRANSFER', 'OTHER']).default('CASH'),
  paidDate: z.string().optional(),
  notes: z.string().optional(),
});

export const updatePaymentSchema = z.object({
  amount: z.number().min(0).optional(),
  status: z.enum(['PAID', 'PENDING', 'OVERDUE', 'PARTIAL', 'CANCELLED']).optional(),
  paymentMethod: z.enum(['CASH', 'INSTAPAY', 'BANK_TRANSFER', 'OTHER']).optional(),
  paidDate: z.string().optional(),
  notes: z.string().optional(),
});
