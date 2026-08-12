import { Request, Response, NextFunction } from 'express';
import { EnrollmentRequestService } from '../services/enrollmentRequest.service';
import {
  createEnrollmentRequestSchema,
  rejectEnrollmentRequestSchema,
} from '../validators/enrollmentRequest.validator';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class EnrollmentRequestController {
  /**
   * Public submission of enrollment request
   */
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parseResult = createEnrollmentRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return next(
          ApiError.badRequest('بيانات طلب الانضمام غير صالحة', parseResult.error.flatten().fieldErrors)
        );
      }

      const result = await EnrollmentRequestService.createRequest(parseResult.data);
      return ApiResponse.success(res, 201, 'تم تقديم طلب الانضمام بنجاح، وسنتواصل معك قريباً', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List enrollment requests (Admin / Teacher)
   */
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, grade } = req.query;
      const results = await EnrollmentRequestService.listRequests(
        status as string,
        grade as string
      );
      return ApiResponse.success(res, 200, 'تم جلب طلبات الانضمام بنجاح', results);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Approve request & create Student User (Admin / Teacher)
   */
  static async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = BigInt(req.params.id);
      const reviewerId = BigInt(req.user!.userId);

      const result = await EnrollmentRequestService.approveRequest(requestId, reviewerId);
      return ApiResponse.success(res, 200, 'تم قبول طلب الانضمام وإنشاء حساب الطالب بنجاح', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reject request (Admin / Teacher)
   */
  static async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = BigInt(req.params.id);
      const reviewerId = BigInt(req.user!.userId);

      const parseResult = rejectEnrollmentRequestSchema.safeParse(req.body);
      const rejectionReason = parseResult.success ? parseResult.data.rejectionReason : undefined;

      const result = await EnrollmentRequestService.rejectRequest(
        requestId,
        reviewerId,
        rejectionReason
      );
      return ApiResponse.success(res, 200, 'تم رفض طلب الانضمام بنجاح', result);
    } catch (error) {
      next(error);
    }
  }
}
