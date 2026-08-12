import { Response } from 'express';

export interface ApiResponsePayload<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: any;
  errors?: any;
}

export class ApiResponse {
  static success<T>(res: Response, statusCode: number = 200, message: string, data?: T, meta?: any): Response {
    const responseBody: ApiResponsePayload<T> = {
      success: true,
      message,
      ...(data !== undefined && { data }),
      ...(meta !== undefined && { meta }),
    };
    return res.status(statusCode).json(responseBody);
  }

  static error(res: Response, statusCode: number = 500, message: string, errors?: any): Response {
    const responseBody: ApiResponsePayload = {
      success: false,
      message,
      ...(errors !== undefined && { errors }),
    };
    return res.status(statusCode).json(responseBody);
  }
}
