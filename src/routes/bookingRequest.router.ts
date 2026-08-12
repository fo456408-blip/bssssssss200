import { Router } from 'express';
import { BookingRequestController } from '../controllers/bookingRequest.controller';
import { authenticateJWT, authorizeRoles } from '../middleware/auth.middleware';
import { globalRateLimiter } from '../middleware/rateLimiter.middleware';
import { UserRole } from '@prisma/client';

export const bookingRequestRouter = Router();

// ==========================================
// 1. PUBLIC ENDPOINTS (NO JWT AUTHENTICATION)
// ==========================================
bookingRequestRouter.get('/public/courses', BookingRequestController.getPublicCourses);
bookingRequestRouter.get('/public/groups', BookingRequestController.getPublicGroups);
bookingRequestRouter.get('/public/activate/info', BookingRequestController.getActivationInfo);
bookingRequestRouter.post('/public/bookings', globalRateLimiter, BookingRequestController.createBooking);
bookingRequestRouter.post('/public/activate', globalRateLimiter, BookingRequestController.activateAccount);

// ==========================================
// 2. PROTECTED REVIEW ENDPOINTS (ADMIN & TEACHER ONLY)
// ==========================================
const protectedBookingRouter = Router();
protectedBookingRouter.use(authenticateJWT);
protectedBookingRouter.use(authorizeRoles(UserRole.ADMIN, UserRole.TEACHER));

protectedBookingRouter.get('/', BookingRequestController.listBookings);
protectedBookingRouter.get('/:id', BookingRequestController.getBookingById);
protectedBookingRouter.post('/:id/approve', BookingRequestController.approveBooking);
protectedBookingRouter.post('/:id/reject', BookingRequestController.rejectBooking);

bookingRequestRouter.use('/', protectedBookingRouter);
