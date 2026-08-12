import { config } from '../config/env';

export interface HealthCheckStatus {
  status: string;
  system: string;
  environment: string;
  timestamp: string;
  uptime: number;
}

export class HealthService {
  public static checkHealth(): HealthCheckStatus {
    return {
      status: 'healthy',
      system: 'EngCode by Ahmed Hamed API Server',
      environment: config.env,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
