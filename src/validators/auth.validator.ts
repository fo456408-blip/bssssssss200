import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({
      required_error: 'اسم المستخدم مطلوب',
    })
    .min(1, 'اسم المستخدم مطلوب'),
  password: z
    .string({
      required_error: 'كلمة المرور مطلوبة',
    })
    .min(1, 'كلمة المرور مطلوبة'),
});

export type LoginInput = z.infer<typeof loginSchema>;
