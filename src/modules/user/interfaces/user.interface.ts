import { Role, UserStatus } from '@prisma/client';

/**
 * PublicUserProfile — safe user shape returned by UserService to the API layer.
 *
 * Contains no sensitive fields (no password, refreshToken, passwordResetToken, etc.).
 * Produced by UserService.toPublicProfile() via stripSensitiveFields().
 *
 * Includes status and updatedAt (unlike the auth module's PublicUser) to support
 * admin-facing user management where account state is relevant.
 *
 * Used by: UserService, UserController responses.
 */

export interface PublicUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}
