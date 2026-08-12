import { z } from 'zod';

// Helper for pagination query
export const paginationSchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(parseInt(val, 10), 100) : 20)),
  search: z.string().optional(),
  status: z.string().optional(),
});

// 1. Student Schemas
export const createStudentSchema = z.object({
  username: z.string().min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  fullName: z.string().min(2, 'الاسم الكامل مطلوب'),
  phone: z.string().optional(),
  email: z.string().email('البريد الإلكتروني غير صالح').optional().or(z.literal('')),
  parentId: z.string().optional(),
  grade: z.enum(['FIRST_SECONDARY', 'SECOND_SECONDARY', 'THIRD_SECONDARY', 'OTHER']),
  schoolName: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

export const updateStudentSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  parentId: z.string().nullable().optional(),
  grade: z.enum(['FIRST_SECONDARY', 'SECOND_SECONDARY', 'THIRD_SECONDARY', 'OTHER']).optional(),
  schoolName: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

// 2. Parent Schemas
export const createParentSchema = z.object({
  username: z.string().min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  fullName: z.string().min(2, 'الاسم الكامل مطلوب'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  occupation: z.string().optional(),
  notes: z.string().optional(),
});

export const updateParentSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  occupation: z.string().optional(),
  notes: z.string().optional(),
});

export const linkStudentsSchema = z.object({
  studentIds: z.array(z.string()),
});

// 3. Teacher Schemas
export const createTeacherSchema = z.object({
  username: z.string().min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  fullName: z.string().min(2, 'الاسم الكامل مطلوب'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  specialization: z.string().optional(),
  bio: z.string().optional(),
});

export const updateTeacherSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  specialization: z.string().optional(),
  bio: z.string().optional(),
});

// 5. Academic Year Schemas
export const createAcademicYearSchema = z.object({
  name: z.string().min(3, 'اسم السنة الدراسية مطلوب (مثال: 2026/2027)'),
  startDate: z.string().min(1, 'تاريخ البداية مطلوب'),
  endDate: z.string().min(1, 'تاريخ النهاية مطلوب'),
  isCurrent: z.boolean().optional(),
});

export const updateAcademicYearSchema = z.object({
  name: z.string().min(3).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isCurrent: z.boolean().optional(),
});

// 6. Course / Academic Subject Schemas
export const createCourseSchema = z.object({
  academicYearId: z.string().min(1, 'السنة الدراسية مطلوبة'),
  code: z.string().min(2, 'كود المادة الدراسية مطلوب'),
  name: z.string().min(2, 'اسم المادة الدراسية مطلوب'),
  grade: z.enum(['FIRST_SECONDARY', 'SECOND_SECONDARY', 'THIRD_SECONDARY', 'OTHER']).optional().default('FIRST_SECONDARY'),
  teacherId: z.string().nullable().optional(),
  description: z.string().optional(),
  defaultMonthlyFee: z.number().min(0, 'مصاريف المادة الدراسية يجب أن تكون أكبر من أو تساوي 0').optional().default(350),
});

export const updateCourseSchema = z.object({
  academicYearId: z.string().optional(),
  code: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  grade: z.enum(['FIRST_SECONDARY', 'SECOND_SECONDARY', 'THIRD_SECONDARY', 'OTHER']).optional(),
  teacherId: z.string().nullable().optional(),
  description: z.string().optional(),
  defaultMonthlyFee: z.number().min(0).optional(),
});

// 7. Group Schemas
export const groupScheduleItemSchema = z.object({
  dayOfWeek: z.enum(['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
  startTime: z.string().min(1, 'وقت البداية مطلوب'),
  endTime: z.string().min(1, 'وقت النهاية مطلوب'),
  roomLocation: z.string().optional(),
}).refine((data) => data.startTime < data.endTime, {
  message: 'وقت البداية يجب أن يكون قبل وقت النهاية',
  path: ['endTime'],
});

export const createGroupSchema = z.object({
  courseId: z.string().min(1, 'الكورس مطلوب'),
  teacherId: z.string().optional(),
  name: z.string().min(2, 'اسم المجموعة مطلوب'),
  maxCapacity: z.number().min(1, 'سعة المجموعة يجب أن تكون على الأقل 1').default(30),
  schedules: z.array(groupScheduleItemSchema).optional(),
});

export const updateGroupSchema = z.object({
  courseId: z.string().optional(),
  teacherId: z.string().nullable().optional(),
  name: z.string().min(2).optional(),
  maxCapacity: z.number().min(1).optional(),
  schedules: z.array(groupScheduleItemSchema).optional(),
});

// 8. Enrollment Schemas
export const createEnrollmentSchema = z.object({
  studentId: z.string().min(1, 'الطالب مطلوب'),
  courseId: z.string().min(1, 'الكورس مطلوب'),
  academicYearId: z.string().min(1, 'السنة الدراسية مطلوبة'),
  monthlyFee: z.number().min(0, 'المصاريف الشهرية يجب أن تكون أكبر من أو تساوي 0'),
});

export const updateEnrollmentSchema = z.object({
  monthlyFee: z.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'COMPLETED', 'CANCELLED']).optional(),
});

export const statusToggleSchema = z.object({
  isActive: z.boolean().optional(),
  status: z.string().optional(),
});
