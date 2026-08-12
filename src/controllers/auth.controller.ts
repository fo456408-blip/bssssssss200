import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { loginSchema } from '../validators/auth.validator';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { REFRESH_COOKIE_NAME, getRefreshCookieOptions } from '../middleware/cookieParser.middleware';

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Zod Input validation
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return next(ApiError.badRequest('بيانات الدخول غير صالحة', parseResult.error.flatten().fieldErrors));
      }

      // 2. Authentication service call
      const authResult = await AuthService.login(
        parseResult.data,
        req.ip,
        req.headers['user-agent'] as string
      );

      // Set HttpOnly Refresh Token cookie
      res.cookie(REFRESH_COOKIE_NAME, authResult.refreshToken, getRefreshCookieOptions());

      return ApiResponse.success(res, 200, 'تم تسجيل الدخول بنجاح', {
        user: authResult.user,
        accessToken: authResult.accessToken,
        token: authResult.accessToken,
      });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const rawRefreshToken = req.cookies[REFRESH_COOKIE_NAME];
      if (!rawRefreshToken) {
        throw ApiError.unauthorized('رمز الجلسة غير موجود');
      }

      const result = await AuthService.refreshSession(
        rawRefreshToken,
        req.ip,
        req.headers['user-agent'] as string
      );

      // Set rotated HttpOnly Refresh Token cookie
      res.cookie(REFRESH_COOKIE_NAME, result.newRefreshToken, getRefreshCookieOptions());

      return ApiResponse.success(res, 200, 'تم تجديد الجلسة بنجاح', {
        user: result.user,
        accessToken: result.accessToken,
        token: result.accessToken,
      });
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
      next(error);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('جلسة المستخدم غير صالحة'));
      }

      const userProfile = await AuthService.getCurrentUser(BigInt(req.user.userId));
      return ApiResponse.success(res, 200, 'تم جلب الملف الشخصي بنجاح', userProfile);
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const rawRefreshToken = req.cookies[REFRESH_COOKIE_NAME];
      await AuthService.logoutSession(rawRefreshToken);
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });

      return ApiResponse.success(res, 200, 'تم تسجيل الخروج بنجاح.');
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
      next(error);
    }
  }
}
