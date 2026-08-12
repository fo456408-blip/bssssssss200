import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { JwtPayload } from '../types/express';

export class JwtUtils {
  static signAccessToken(payload: { userId: string | number; role: string; username: string }): string {
    return jwt.sign(payload, config.jwt.secret as jwt.Secret, {
      expiresIn: (config.jwt.expiresIn || '15m') as any,
    });
  }

  static signToken(payload: { userId: string | number; role: string; username: string }): string {
    return this.signAccessToken(payload);
  }

  static verifyToken(token: string): JwtPayload {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    return {
      userId: decoded.userId,
      role: decoded.role,
      username: decoded.username,
    };
  }
}
