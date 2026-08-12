import { Request } from 'express';

export interface JwtPayload {
  userId: bigint | number;
  username: string;
  role: 'admin' | 'teacher' | 'student' | 'parent';
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
