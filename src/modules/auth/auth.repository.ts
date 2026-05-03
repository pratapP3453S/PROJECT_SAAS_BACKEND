import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BaseRepository } from '../../database/repositories/base.repository';

/**
 * AuthRepository — data access layer for authentication-specific user queries.
 *
 * Responsibility: Encapsulates all Prisma calls related to auth flows.
 * Extends BaseRepository<User> for generic CRUD (findById, create, update, etc.)
 * and adds auth-specific write methods that other repositories should not own.
 *
 * Table   : users (mapped via @@map in user.schema.prisma)
 * Model   : User (@prisma/client)
 * Inherits: BaseRepository<User> → src/database/repositories/base.repository.ts
 *
 * Used by: AuthService
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
   *
   * Flow:
   * 1. Normalizes email to lower-case before querying.
   * 2. Prisma findFirst WHERE email = :email AND deleted_at IS NULL.
   * 3. Returns the full User row, or null if not found.
   *
   * Note: Uses findFirst (not findUnique) so that the deletedAt filter can be
   * applied alongside the email filter in a single query.
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
   *
   * Flow:
   * 1. Prisma UPDATE users SET refresh_token = :hashedToken WHERE id = :userId.
   * 2. Passing null clears the column, making any existing refresh token unusable.
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
   *
   * Flow:
   * 1. Prisma UPDATE users SET last_login_at = NOW() WHERE id = :userId.
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
   *
   * Flow:
   * 1. Prisma UPDATE users
   *    SET password_reset_token = :token, password_reset_expiry = :expiry
   *    WHERE id = :userId.
   *
   * Note: token should be a cryptographically random hex string (generateSecureToken).
   *       expiry is typically now() + 15–60 minutes (caller's responsibility).
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
   *
   * Flow:
   * 1. Prisma UPDATE users
   *    SET password_reset_token = NULL, password_reset_expiry = NULL
   *    WHERE id = :userId.
   *
   * Ensures the same reset link cannot be used a second time.
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
   *
   * Flow:
   * 1. Prisma UPDATE users
   *    SET email_verified = TRUE, email_verified_at = NOW()
   *    WHERE id = :userId.
   */
  async verifyEmail(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });
  }
}
