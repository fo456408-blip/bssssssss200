import { prisma } from '../config/database';
import { PasswordUtils } from '../utils/password';
import { JwtUtils } from '../utils/jwt';
import { SessionUtils } from '../utils/session';
import { ApiError } from '../utils/apiError';
import { LoginInput } from '../validators/auth.validator';
import { config } from '../config/env';

export class AuthService {
  static async login(input: LoginInput, ipAddress?: string, userAgent?: string) {
    const { username, password } = input;

    // 1. Find user by username or phone (select hash for verification)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { phone: username },
        ],
      },
    });

    // Security: Generic error message
    if (!user) {
      throw ApiError.unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    // 2. Check active status
    if (!user.isActive) {
      throw ApiError.unauthorized('تم إيقاف هذا الحساب، يرجى التواصل مع الإدارة');
    }

    // 3. Compare password
    const isPasswordValid = await PasswordUtils.comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    // 4. Retrieve role-specific profile details
    const profile = await this.getRoleProfile(user.id, user.role);

    // 5. Sign short-lived Access Token (15m)
    const accessToken = JwtUtils.signAccessToken({
      userId: user.id.toString(),
      role: user.role,
      username: user.username,
    });

    // 6. Generate & Hash long-lived Refresh Token (30 days)
    const rawRefreshToken = SessionUtils.generateRefreshToken();
    const tokenHash = SessionUtils.hashToken(rawRefreshToken);
    const refreshExpiresDays = config.jwt.refreshExpiresDays || 30;
    const expiresAt = new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000);

    // Store AuthSession in DB
    await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    return {
      user: {
        id: user.id.toString(),
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone,
        email: user.email,
        profile,
      },
      accessToken,
      refreshToken: rawRefreshToken,
      // Backward compatibility
      token: accessToken,
    };
  }

  static async refreshSession(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    if (!rawRefreshToken) {
      throw ApiError.unauthorized('رمز التحديث مطلوب');
    }

    const tokenHash = SessionUtils.hashToken(rawRefreshToken);

    const session = await prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || new Date() > session.expiresAt || !session.user.isActive) {
      throw ApiError.unauthorized('جلسة المستخدم منتهية الصلاحية أو غير صالحة');
    }

    const user = session.user;
    const profile = await this.getRoleProfile(user.id, user.role);

    // Rotate refresh token: revoke old session, create new session
    const newRawRefreshToken = SessionUtils.generateRefreshToken();
    const newTokenHash = SessionUtils.hashToken(newRawRefreshToken);
    const refreshExpiresDays = config.jwt.refreshExpiresDays || 30;
    const expiresAt = new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      prisma.authSession.create({
        data: {
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt,
          ipAddress: ipAddress || session.ipAddress,
          userAgent: userAgent || session.userAgent,
        },
      }),
    ]);

    // Sign new short-lived Access Token
    const accessToken = JwtUtils.signAccessToken({
      userId: user.id.toString(),
      role: user.role,
      username: user.username,
    });

    return {
      user: {
        id: user.id.toString(),
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone,
        email: user.email,
        profile,
      },
      accessToken,
      newRefreshToken: newRawRefreshToken,
    };
  }

  static async logoutSession(rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const tokenHash = SessionUtils.hashToken(rawRefreshToken);
      await prisma.authSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  static async getCurrentUser(userId: bigint) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        phone: true,
        email: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('المستخدم غير موجود أو غير نشط');
    }

    const profile = await this.getRoleProfile(user.id, user.role);

    return {
      id: user.id.toString(),
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      email: user.email,
      profile,
    };
  }

  private static async getRoleProfile(userId: bigint, role: string) {
    if (role === 'ADMIN') {
      return { type: 'admin' };
    }

    if (role === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId },
      });
      return teacher
        ? {
            id: teacher.id.toString(),
            specialization: teacher.specialization,
            bio: teacher.bio,
          }
        : null;
    }

    if (role === 'STUDENT') {
      const student = await prisma.student.findUnique({
        where: { userId },
        include: {
          parent: {
            include: {
              user: {
                select: { fullName: true, phone: true },
              },
            },
          },
        },
      });
      return student
        ? {
            id: student.id.toString(),
            parentId: student.parentId?.toString(),
            grade: student.grade,
            schoolName: student.schoolName,
            dateOfBirth: student.dateOfBirth,
            parentName: student.parent?.user.fullName || null,
            parentPhone: student.parent?.user.phone || null,
          }
        : null;
    }

    if (role === 'PARENT') {
      const parent = await prisma.parent.findUnique({
        where: { userId },
        include: {
          students: {
            include: {
              user: {
                select: { fullName: true, id: true },
              },
            },
          },
        },
      });
      return parent
        ? {
            id: parent.id.toString(),
            occupation: parent.occupation,
            notes: parent.notes,
            children: parent.students.map((child) => ({
              id: child.id.toString(),
              fullName: child.user.fullName,
              grade: child.grade,
            })),
          }
        : null;
    }

    return null;
  }
}
