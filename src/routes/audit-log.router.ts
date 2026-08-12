import { Router } from 'express';
import { AuditLogController } from '../controllers/audit-log.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';

const auditLogRouter = Router();

// Audit log endpoint requires Admin role
auditLogRouter.get('/admin/audit-logs', authenticateJWT, authorizeRoles('admin'), AuditLogController.getAuditLogs);

// Immutability rejection handlers
auditLogRouter.post('/admin/audit-logs', authenticateJWT, authorizeRoles('admin'), AuditLogController.rejectCreate);
auditLogRouter.patch('/admin/audit-logs/:id', authenticateJWT, authorizeRoles('admin'), AuditLogController.rejectUpdate);
auditLogRouter.delete('/admin/audit-logs/:id', authenticateJWT, authorizeRoles('admin'), AuditLogController.rejectDelete);

export default auditLogRouter;
