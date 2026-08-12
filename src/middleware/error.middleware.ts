import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/apiError';
import { ApiResponse } from '../utils/apiResponse';
import { config } from '../config/env';

export const errorMiddleware = (
  err: Error | ApiError | ZodError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof ApiError) {
    return ApiResponse.error(res, err.statusCode, err.message, err.errors);
  }

  if (err instanceof ZodError) {
    return ApiResponse.error(res, 400, 'بيانات المدخلات غير صالحة', err.flatten().fieldErrors);
  }

  // Handle unexpected errors without revealing stack trace in production
  const message = config.env === 'development' ? err.message : 'Internal Server Error';
  const errors = config.env === 'development' ? err.stack : undefined;

  return ApiResponse.error(res, 500, message, errors);
};
