import { z } from 'zod';

// 1. Quiz CRUD Schemas
export const createQuizSchema = z.object({
  lessonId: z.string().min(1, 'الدرس مطلوب'),
  title: z.string().min(2, 'عنوان الاختبار مطلوب'),
  description: z.string().optional(),
  durationMinutes: z.number().min(1, 'مدة الاختبار يجب أن تكون على الأقل دقيقة واحدة').default(30),
  passingScore: z.number().min(0).max(100, 'درجة النجاح يجب أن تكون بين 0 و 100').default(50),
  maxAttempts: z.number().min(1, 'الحد الأقصى للمحاولات يجب أن يكون على الأقل 1').default(1),
  isPublished: z.boolean().default(false),
});

export const updateQuizSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  durationMinutes: z.number().min(1).optional(),
  passingScore: z.number().min(0).max(100).optional(),
  maxAttempts: z.number().min(1).optional(),
  isPublished: z.boolean().optional(),
});

// 2. Question & Option Creation Schemas
const optionSchema = z.object({
  optionText: z.string().min(1, 'نص الاختيار مطلوب'),
  isCorrect: z.boolean().default(false),
  displayOrder: z.number().min(1).default(1),
});

export const createQuestionSchema = z.object({
  quizId: z.string().min(1, 'الاختبار مطلوب'),
  questionType: z.enum(['MCQ', 'TRUE_FALSE']),
  questionText: z.string().min(2, 'نص السؤال مطلوب'),
  points: z.number().min(0.1, 'الدرجة يجب أن تكون أكبر من 0').default(1),
  imageUrl: z.string().optional(),
  displayOrder: z.number().min(1).default(1),
  options: z.array(optionSchema).refine(
    (opts) => {
      const correctCount = opts.filter((o) => o.isCorrect).length;
      return correctCount === 1;
    },
    { message: 'يجب اختيار الإجابة الصحيحة بالضبط مرة واحدة لكل سؤال' }
  ),
});

export const updateQuestionSchema = z.object({
  questionType: z.enum(['MCQ', 'TRUE_FALSE']).optional(),
  questionText: z.string().min(2).optional(),
  points: z.number().min(0.1).optional(),
  imageUrl: z.string().nullable().optional(),
  options: z.array(optionSchema).optional(),
});

export const reorderQuestionsSchema = z.object({
  orders: z.array(
    z.object({
      questionId: z.string().min(1),
      displayOrder: z.number().min(1),
    })
  ),
});

// 3. Student Answer Submission Schema
export const submitAttemptSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1, 'معرف السؤال مطلوب'),
      selectedOptionId: z.string().min(1, 'معرف الإجابة المختارة مطلوب'),
    })
  ),
});
