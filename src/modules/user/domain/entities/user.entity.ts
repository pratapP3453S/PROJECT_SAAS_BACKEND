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
 * Layer: domain — this is the canonical entity shape the application uses
 * internally. API serializers map this to versioned response DTOs if/when the
 * external shape needs to diverge from the internal one.
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
