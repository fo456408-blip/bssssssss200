import { Request, Response, NextFunction } from 'express';
import { HealthService } from '../services/health.service';
import { ApiResponse } from '../utils/apiResponse';

export class HealthController {
  public static getStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const healthData = HealthService.checkHealth();
      return ApiResponse.success(res, 200, 'Server is running healthily', healthData);
    } catch (error) {
      next(error);
    }
  }
}
