import { Role, User } from '@prisma/client';

/**
 * auth.entity — domain shapes for the auth feature.
 *
 * AuthTokens:
 *  accessToken  : short-lived JWT (default 7d) signed with jwt.secret.
 *  refreshToken : long-lived JWT (default 30d) signed with jwt.refreshSecret.
 *  expiresIn    : access token TTL in seconds (7 * 24 * 60 * 60 = 604800).
 *
 * AuthResponse:
 *  Returned by register() and login(). Combines the public user profile
 *  (no password, no refreshToken hash) with the new token pair.
 *
 * PublicUser:
 *  Safe subset of the Prisma User model — no sensitive fields.
 *  Used in API responses so the password hash and refresh token never
 *  leave the server.
 *
 * toPublicUser(user):
 *  Maps a full Prisma User to PublicUser. Called by AuthService after
 *  register() and login() before returning to the controller.
 */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatar: string | null;
  emailVerified: boolean;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    avatar: user.avatar,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}
