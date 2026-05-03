import { Request } from 'express';

/**
 * request.interface — typed Express request extensions for the authenticated context.
 *
 * AuthenticatedUser:
 *  The minimal user shape attached to req.user by JwtStrategy.validate().
 *  Used by @CurrentUser() decorator and RolesGuard to read identity and role
 *  without re-querying the database on every request.
 *
 * AuthenticatedRequest:
 *  Extends Express Request to type req.user as AuthenticatedUser (non-optional).
 *  Cast to this type inside guards and middleware where user is guaranteed
 *  to be populated (i.e., after JwtAuthGuard has run).
 *
 * Used by:
 *  JwtStrategy    → returns AuthenticatedUser from validate()
 *  RolesGuard     → reads request.user.role
 *  @CurrentUser() → reads request.user (or a key thereof)
 */
import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
