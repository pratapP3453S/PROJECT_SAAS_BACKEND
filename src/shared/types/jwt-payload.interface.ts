import { Role } from '@prisma/client';

/**
 * JwtPayload — shape of the access token JWT payload.
 *
 * sub   : user ID (UUID) — the standard JWT "subject" claim.
 * email : user email — included for quick identification without a DB lookup.
 * role  : Prisma Role enum — used by RolesGuard after JwtStrategy.validate().
 * iat   : issued-at timestamp (added by JwtService automatically).
 * exp   : expiry timestamp (added by JwtService automatically).
 *
 * Signed with: jwt.secret | JWT_SECRET
 * Verified by: JwtStrategy.validate()
 *
 * RefreshTokenPayload — shape of the refresh token JWT payload (minimal).
 * Only carries `sub` to minimize exposure if a refresh token is decoded.
 * tokenVersion is reserved for future refresh token revocation by version.
 *
 * Signed with: jwt.refreshSecret | JWT_REFRESH_SECRET
 * Verified by: AuthService.refreshTokens() (via bcrypt, not JwtStrategy)
 */

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}
