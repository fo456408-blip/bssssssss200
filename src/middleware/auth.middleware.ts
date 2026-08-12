import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { JwtUtils } from '../utils/jwt';
import { ApiError } from '../utils/apiError';
import { prisma } from '../config/database';

export const authenticateJWT = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(ApiError.unauthorized('يجب تسجيل الدخول للوصول إلى هذا المورد'));
    }

    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = JwtUtils.verifyToken(token);
    } catch (err) {
      return next(ApiError.unauthorized('رمز الجلسة غير صالح أو منتهي الصلاحية'));
    }

    // Convert string/number userId back to BigInt for lookup
    const userIdBigInt = BigInt(payload.userId);

    const user = await prisma.user.findUnique({
      where: { id: userIdBigInt },
      select: { id: true, username: true, role: true, isActive: true },
    });

    if (!user) {
      return next(ApiError.unauthorized('المستخدم غير موجود'));
    }

    if (!user.isActive) {
      return next(ApiError.unauthorized('تم إيقاف هذا الحساب، يرجى التواصل مع الإدارة'));
    }

    // Attach to request (normalized lowercase role)
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role.toString().toLowerCase() as any,
    };

    next();
  } catch (err) {
    next(err);
  }
};

export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized('يجب تسجيل الدخول للوصول إلى هذا المورد'));
    }

    const userRole = (req.user.role || '').toString().toLowerCase();
    const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());

    if (!normalizedAllowed.includes(userRole)) {
      return next(ApiError.forbidden('ليس لديك الصلاحية الكافية للوصول إلى هذا المورد'));
    }

    next();
  };
};

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 login requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'محاولات دخول كثيرة جداً، يرجى المحاولة مرة أخرى بعد 15 دقيقة.',
  },
});
