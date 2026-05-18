import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma/prisma.service';
import { BaseRepository } from '../../../../core/database/repositories/base.repository';

/**
 * AuthRepository — Prisma-backed data access for auth-specific user queries.
 *
 * Layer: infrastructure/prisma — concrete persistence. The application layer
 * (AuthService) talks to this class through Nest DI; swapping the database
 * implementation only touches this file.
 *
 * Inherits: BaseRepository<User> → src/core/database/repositories/base.repository.ts
 *
 * Extra methods (beyond BaseRepository CRUD):
 *  findByEmail               : case-insensitive lookup excluding soft-deleted rows.
 *  updateRefreshToken        : persists or clears the bcrypt-hashed refresh token.
 *  updateLastLogin           : stamps `last_login_at = NOW()`.
 *  setPasswordResetToken     : reserved for the future password-reset flow.
 *  clearPasswordResetToken   : reserved for the future password-reset flow.
 *  verifyEmail               : marks the user's email address as verified.
 *
 * Used by: AuthService (application/use-cases)
 */
@Injectable()
export class AuthRepository extends BaseRepository<User> {
  protected readonly modelName = 'user';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Finds an active user by email address (case-insensitive, excludes soft-deleted).
   * Called by: AuthService.register() — uniqueness check
   *            AuthService.login()    — credential lookup
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  /**
   * Persists or clears the bcrypt-hashed refresh token on a user record.
   * Called by: AuthService.saveRefreshToken() — after login / register / refresh
   *            AuthService.logout()           — passes null to invalidate session
   */
  async updateRefreshToken(userId: string, hashedToken: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedToken },
    });
  }

  /**
   * Stamps the last_login_at timestamp to the current UTC time.
   * Called by: AuthService.register(), AuthService.login()
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Stores a one-time password-reset token and its expiry on the user record.
   * Called by: (Future) ForgotPasswordService or AuthService.forgotPassword()
   */
  async setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });
  }

  /**
   * Nullifies the password-reset token and expiry after a successful reset.
   * Called by: (Future) AuthService.resetPassword() — after password is changed
   */
  async clearPasswordResetToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordResetToken: null, passwordResetExpiry: null },
    });
  }

  /**
   * Marks the user's email address as verified and records the verification time.
   * Called by: (Future) AuthService.verifyEmail() — upon token confirmation
   */
  async verifyEmail(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });
  }
}
