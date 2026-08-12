import crypto from 'crypto';

export class SessionUtils {
  /**
   * Generates a cryptographically random hex refresh token string (80 chars).
   */
  static generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  /**
   * Computes SHA-256 hash of a raw token for secure database storage.
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
