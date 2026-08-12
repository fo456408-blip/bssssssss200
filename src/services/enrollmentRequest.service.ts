import { prisma } from '../config/database';
import { PasswordUtils } from '../utils/password';
import { ApiError } from '../utils/apiError';
import { CreateEnrollmentRequestInput } from '../validators/enrollmentRequest.validator';

export class EnrollmentRequestService {
  /**
   * Submit public enrollment request (with duplicate PENDING check by phone)
   */
  static async createRequest(input: CreateEnrollmentRequestInput) {
    const cleanPhone = input.phone.trim();

    // 1. Check for existing PENDING request with same phone
    const existingPending = await prisma.enrollmentRequest.findFirst({
      where: {
        phone: cleanPhone,
        status: 'PENDING',
      },
    });

    if (existingPending) {
      throw ApiError.badRequest('عندك بالفعل طلب قيد المراجعة، وهنكون على تواصل معاك قريبًا.');
    }

    // 2. Create enrollment request
    const request = await prisma.enrollmentRequest.create({
      data: {
        fullName: input.fullName.trim(),
        phone: cleanPhone,
        email: input.email ? input.email.trim() : null,
        grade: input.grade,
        schoolName: input.schoolName ? input.schoolName.trim() : null,
        course: input.course.trim(),
        learningMode: input.learningMode,
        notes: input.notes ? input.notes.trim() : null,
        status: 'PENDING',
      },
    });

    return {
      id: request.id.toString(),
      fullName: request.fullName,
      phone: request.phone,
      grade: request.grade,
      course: request.course,
      status: request.status,
      createdAt: request.createdAt,
    };
  }

  /**
   * List enrollment requests (for Admin / Teacher)
   */
  static async listRequests(status?: string, grade?: string) {
    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (grade) {
      where.grade = grade;
    }

    const requests = await prisma.enrollmentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        reviewedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    return requests.map((req) => ({
      id: req.id.toString(),
      fullName: req.fullName,
      phone: req.phone,
      email: req.email,
      grade: req.grade,
      schoolName: req.schoolName,
      course: req.course,
      learningMode: req.learningMode,
      notes: req.notes,
      status: req.status,
      rejectionReason: req.rejectionReason,
      createdAt: req.createdAt,
      reviewedAt: req.reviewedAt,
      reviewedBy: req.reviewedBy
        ? {
            id: req.reviewedBy.id.toString(),
            fullName: req.reviewedBy.fullName,
            role: req.reviewedBy.role,
          }
        : null,
    }));
  }

  /**
   * Approve enrollment request (Atomic Prisma Transaction)
   * Creates Student User + Student profile + updates request status to APPROVED
   */
  static async approveRequest(requestId: bigint, reviewerId: bigint) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch request
      const request = await tx.enrollmentRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        throw ApiError.notFound('طلب الانضمام غير موجود');
      }

      if (request.status !== 'PENDING') {
        throw ApiError.badRequest(`الطلب تم التعامل معه سابقاً وحالته الحالية: ${request.status}`);
      }

      // 2. Generate unique username from phone
      const sanitizePhone = request.phone.replace(/\D/g, '');
      let baseUsername = `std_${sanitizePhone || Math.floor(Math.random() * 1000000)}`;
      let finalUsername = baseUsername;
      let counter = 1;

      while (await tx.user.findUnique({ where: { username: finalUsername } })) {
        finalUsername = `${baseUsername}_${counter}`;
        counter++;
      }

      // 3. Initial password & Hash
      const initialPassword = `stdPass123!`;
      const passwordHash = await PasswordUtils.hashPassword(initialPassword);

      // 4. Create User (STUDENT role)
      const user = await tx.user.create({
        data: {
          username: finalUsername,
          passwordHash,
          fullName: request.fullName,
          role: 'STUDENT',
          phone: request.phone,
          email: request.email || null,
          isActive: true,
        },
      });

      // 5. Create Student profile
      const student = await tx.student.create({
        data: {
          userId: user.id,
          grade: request.grade,
          schoolName: request.schoolName || null,
        },
      });

      // 6. Update Request Status to APPROVED
      const updatedRequest = await tx.enrollmentRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedById: reviewerId,
        },
      });

      return {
        requestId: updatedRequest.id.toString(),
        status: updatedRequest.status,
        createdStudent: {
          id: student.id.toString(),
          userId: user.id.toString(),
          username: user.username,
          fullName: user.fullName,
          grade: student.grade,
        },
      };
    });
  }

  /**
   * Reject enrollment request
   */
  static async rejectRequest(requestId: bigint, reviewerId: bigint, rejectionReason?: string) {
    const request = await prisma.enrollmentRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw ApiError.notFound('طلب الانضمام غير موجود');
    }

    if (request.status !== 'PENDING') {
      throw ApiError.badRequest(`الطلب تم التعامل معه سابقاً وحالته الحالية: ${request.status}`);
    }

    const updated = await prisma.enrollmentRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason || 'لم يتم استيفاء شروط القبول',
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });

    return {
      requestId: updated.id.toString(),
      status: updated.status,
      rejectionReason: updated.rejectionReason,
      reviewedAt: updated.reviewedAt,
    };
  }
}
