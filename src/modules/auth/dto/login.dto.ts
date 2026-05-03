import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * LoginDto — request body for POST /auth/login.
 *
 * Intentionally minimal — only email + password. No format enforcement on password
 * here (AuthService does bcrypt.compare against the stored hash).
 *
 * Used by: AuthController.login() → AuthService.login()
 */
export class LoginDto {
  @ApiProperty({ example: 'john.doe@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password@123', description: 'User password' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  password: string;
}

/**
 * RefreshTokenDto — request body for POST /auth/refresh.
 * The raw refresh JWT must be present; AuthController decodes the `sub` from it
 * before passing to AuthService.refreshTokens() for bcrypt verification.
 */
export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required.' })
  refreshToken: string;
}

/**
 * ChangePasswordDto — request body for a future PUT /auth/change-password endpoint.
 * currentPassword is verified via bcrypt before newPassword is hashed and saved.
 */
export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: 'New password' })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}

/**
 * ForgotPasswordDto — request body for a future POST /auth/forgot-password endpoint.
 * The email is used to look up the account and dispatch a reset token via email queue.
 */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @IsNotEmpty()
  email: string;
}

/**
 * ResetPasswordDto — request body for a future POST /auth/reset-password endpoint.
 * The token is validated against the stored hash in AuthRepository.
 * The newPassword replaces the old one after bcrypt hashing.
 */
export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'New password' })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}
