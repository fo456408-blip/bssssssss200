import { prisma } from '../config/database';
import { UserRole } from '@prisma/client';

export class AuditLogService {
  // Append-only audit logger deriving actor identity strictly from authenticated JWT user
  static async logAction(
    reqUser: { userId: bigint | string; role: UserRole },
    action: string,
    entityType: string,
    entityId?: bigint | string,
    beforeState?: string | object | null,
    afterState?: string | object | null,
    metadata?: string | object | null,
    ipAddress?: string
  ) {
    const actorId = BigInt(reqUser.userId);
    const actorRole = reqUser.role;

    // Sanitize function to ensure NO secrets or passwords are saved in audit records
    const sanitize = (input: any): string | null => {
      if (!input) return null;
      let str = typeof input === 'string' ? input : JSON.stringify(input);

      // Remove sensitive keys/tokens if present
      str = str.replace(/"passwordHash"\s*:\s*"[^"]*"/gi, '"passwordHash":"[REDACTED]"');
      str = str.replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[REDACTED]"');
      str = str.replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[REDACTED]"');
      str = str.replace(/R2_SECRET_ACCESS_KEY/gi, '[REDACTED_SECRET]');

      return str;
    };

    return prisma.auditLog.create({
      data: {
        actorId,
        actorRole,
        action,
        entityType,
        entityId: entityId ? BigInt(entityId) : null,
        beforeState: sanitize(beforeState),
        afterState: sanitize(afterState),
        metadata: sanitize(metadata),
        ipAddress: ipAddress || null,
      },
    });
  }

  // Get Audit Logs (Admin-Only)
  static async getAuditLogs(filters?: {
    actorId?: string;
    action?: string;
    entityType?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};

    if (filters?.actorId) {
      where.actorId = BigInt(filters.actorId);
    }
    if (filters?.action) {
      where.action = { contains: filters.action };
    }
    if (filters?.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { fullName: true, username: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return logs.map((log) => ({
      id: log.id.toString(),
      actorName: log.actor.fullName,
      actorUsername: log.actor.username,
      actorRole: log.actorRole,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ? log.entityId.toString() : null,
      beforeState: log.beforeState,
      afterState: log.afterState,
      metadata: log.metadata,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    }));
  }
}
