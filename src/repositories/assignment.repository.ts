import { prisma } from '../config/database';

export class AssignmentRepository {
  // 1. ASSIGNMENTS
  static async findAssignmentsByLesson(lessonId: bigint, onlyPublished: boolean = false) {
    return prisma.assignment.findMany({
      where: {
        lessonId,
        ...(onlyPublished ? { isPublished: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { studentAssignments: true } },
      },
    });
  }

  static async findAssignmentById(id: bigint) {
    return prisma.assignment.findUnique({
      where: { id },
      include: {
        lesson: { include: { course: true } },
        studentAssignments: {
          include: { student: { include: { user: true } } },
        },
      },
    });
  }

  // 2. SUBMISSIONS
  static async findSubmission(studentId: bigint, assignmentId: bigint) {
    return prisma.studentAssignment.findUnique({
      where: {
        studentId_assignmentId: {
          studentId,
          assignmentId,
        },
      },
      include: {
        assignment: true,
        student: { include: { user: true } },
      },
    });
  }

  static async findSubmissionsByAssignment(assignmentId: bigint) {
    return prisma.studentAssignment.findMany({
      where: { assignmentId },
      orderBy: { submittedAt: 'desc' },
      include: {
        student: { include: { user: true } },
        assignment: true,
      },
    });
  }
}
