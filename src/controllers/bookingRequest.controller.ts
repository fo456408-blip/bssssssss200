import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { BookingRequestService } from '../services/bookingRequest.service';
import {
  createBookingRequestSchema,
  rejectBookingRequestSchema,
  activateAccountSchema,
} from '../validators/bookingRequest.validator';
import { BookingStatus } from '@prisma/client';

export class BookingRequestController {
  // Public Catalogue & Availability
  static async getPublicCourses(req: Request, res: Response) {
    try {
      const courses = await BookingRequestService.getPublicCourses();
      const serialized = JSON.parse(
        JSON.stringify(courses, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      res.json({ success: true, data: serialized });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getPublicGroups(req: Request, res: Response) {
    try {
      const { courseId } = req.query;
      if (!courseId || courseId === '' || courseId === 'undefined') {
        return res.status(400).json({ success: false, message: 'مفتاح الكورس مطلوب' });
      }
      const groups = await BookingRequestService.getPublicGroupsByCourse(BigInt(courseId as string));
      const serialized = JSON.parse(
        JSON.stringify(groups, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      res.json({ success: true, data: serialized });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Public Booking Submission
  static async createBooking(req: Request, res: Response) {
    try {
      const validatedInput = createBookingRequestSchema.parse(req.body);
      const booking = await BookingRequestService.createBookingRequest(validatedInput);
      const serialized = JSON.parse(
        JSON.stringify(booking, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      res.status(201).json({
        success: true,
        message: 'تم إرسال طلب الحجز بنجاح، وطلبك الآن قيد المراجعة.',
        data: serialized,
      });
    } catch (error: any) {
      if (error instanceof ZodError) {
        const firstMsg = error.errors[0]?.message || 'بيانات مدخلات غير صالحة';
        return res.status(400).json({ success: false, message: firstMsg, errors: error.flatten().fieldErrors });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Protected Admin/Teacher Portal List
  static async listBookings(req: Request, res: Response) {
    try {
      const { status, subjectId, courseId, groupId } = req.query;
      const filters: any = {};

      if (status && status !== 'ALL' && status !== '' && status !== 'undefined') {
        const validStatuses = Object.values(BookingStatus);
        if (!validStatuses.includes(status as any)) {
          return res.status(400).json({
            success: false,
            message: `حالة الطلب غير صالحة، الحالات المتاحة هي: ${validStatuses.join(', ')}`,
          });
        }
        filters.status = status as BookingStatus;
      }

      if (subjectId && subjectId !== '' && subjectId !== 'undefined') {
        if (isNaN(Number(subjectId))) {
          return res.status(400).json({ success: false, message: 'مفتاح المادة الدراسية غير صالح' });
        }
        filters.subjectId = BigInt(subjectId as string);
      }

      if (courseId && courseId !== '' && courseId !== 'undefined') {
        if (isNaN(Number(courseId))) {
          return res.status(400).json({ success: false, message: 'مفتاح الكورس غير صالح' });
        }
        filters.courseId = BigInt(courseId as string);
      }

      if (groupId && groupId !== '' && groupId !== 'undefined') {
        if (isNaN(Number(groupId))) {
          return res.status(400).json({ success: false, message: 'مفتاح المجموعة غير صالح' });
        }
        filters.groupId = BigInt(groupId as string);
      }

      const user = (req as any).user;
      const rawUserId = user.userId || user.id;
      if (!rawUserId) {
        return res.status(401).json({ success: false, message: 'تعذر تحديد هوية المستخدم' });
      }

      const bookings = await BookingRequestService.listBookingRequests(
        user.role,
        BigInt(rawUserId),
        filters
      );

      const serialized = JSON.parse(
        JSON.stringify(bookings, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );

      res.json({ success: true, data: serialized });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getBookingById(req: Request, res: Response) {
    try {
      const id = BigInt(req.params.id);
      const user = (req as any).user;
      const rawUserId = user.userId || user.id;
      const booking = await BookingRequestService.getBookingRequestById(
        id,
        user.role,
        BigInt(rawUserId)
      );
      const serialized = JSON.parse(
        JSON.stringify(booking, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      res.json({ success: true, data: serialized });
    } catch (error: any) {
      res.status(403).json({ success: false, message: error.message });
    }
  }

  // Protected Review Approval
  static async approveBooking(req: Request, res: Response) {
    try {
      const id = BigInt(req.params.id);
      const user = (req as any).user;
      const rawUserId = user.userId || user.id;
      const result = await BookingRequestService.approveBookingRequest(
        id,
        BigInt(rawUserId),
        user.role
      );
      const serialized = JSON.parse(
        JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      res.json(serialized);
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Protected Review Rejection
  static async rejectBooking(req: Request, res: Response) {
    try {
      const id = BigInt(req.params.id);
      const user = (req as any).user;
      const rawUserId = user.userId || user.id;
      const validatedInput = rejectBookingRequestSchema.parse(req.body);
      const booking = await BookingRequestService.rejectBookingRequest(
        id,
        validatedInput,
        BigInt(rawUserId),
        user.role
      );
      const serialized = JSON.parse(
        JSON.stringify(booking, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      res.json({ success: true, message: 'تم رفض طلب الحجز بنجاح', data: serialized });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Public Account Activation Info
  static async getActivationInfo(req: Request, res: Response) {
    try {
      const { token } = req.query;
      const user = await BookingRequestService.getActivationInfo(token as string);
      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Public Account Activation
  static async activateAccount(req: Request, res: Response) {
    try {
      const validatedInput = activateAccountSchema.parse(req.body);
      const user = await BookingRequestService.activateAccount(validatedInput);
      const serialized = JSON.parse(
        JSON.stringify(user, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      res.json({
        success: true,
        message: 'تم تفعيل الحساب وتعيين كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول',
        data: serialized,
      });
    } catch (error: any) {
      if (error instanceof ZodError) {
        const firstMsg = error.errors[0]?.message || 'بيانات مدخلات غير صالحة';
        return res.status(400).json({ success: false, message: firstMsg, errors: error.flatten().fieldErrors });
      }
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
