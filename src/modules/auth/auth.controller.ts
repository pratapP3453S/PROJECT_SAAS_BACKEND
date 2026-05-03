import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/request.interface';
import { Responses } from '../../common/constants/response.constants';
import { ApiResponse as AppResponse } from '../../common/responses/api.response';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * AuthController — HTTP entry point for all authentication flows.
 *
 * Responsibility: Accepts and validates incoming HTTP requests, delegates all
 * business logic to AuthService, and returns a standardized response envelope.
 * This layer contains no business logic — it only shapes input/output.
 *
 * Route prefix : POST /auth
 * Guard        : Routes are @Public() by default here; logout uses @JwtAuthGuard.
 * Dependencies : AuthService (service layer)
 * DTOs         : RegisterDto, LoginDto, RefreshTokenDto
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers a new user account and returns tokens on success.
   * Route: POST /auth/register  |  Public (no auth required)
   *
   * Flow:
   * 1. AppValidationPipe validates RegisterDto (email, password strength, names).
   * 2. Delegates to AuthService.register(dto) which checks uniqueness, hashes
   *    password, persists the user, and issues token pair.
   * 3. Returns HTTP 201 with { user: PublicUser, tokens: AuthTokens }.
   *
   * Throws:
   *  - 422 ValidationError   — if DTO constraints fail (AppValidationPipe)
   *  - 409 ConflictError     — ERR_EMAIL_ALREADY_EXISTS (AuthService)
   */
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    return AppResponse.fromDefinition(Responses.REGISTER_SUCCESS, result);
  }

  /**
   * Authenticates a user with email + password and returns a token pair.
   * Route: POST /auth/login  |  Public (no auth required)
   *
   * Flow:
   * 1. AppValidationPipe validates LoginDto (email format, password presence).
   * 2. Delegates to AuthService.login(dto) which verifies credentials,
   *    checks account status, generates tokens, and records last-login time.
   * 3. Returns HTTP 200 with { user: PublicUser, tokens: AuthTokens }.
   *
   * Throws:
   *  - 422 ValidationError      — if DTO constraints fail
   *  - 401 InvalidCredentials   — ERR_INVALID_CREDENTIALS (wrong email/password)
   *  - 403 AccountSuspendedError — ERR_ACCOUNT_SUSPENDED
   *  - 403 AccountInactiveError  — ERR_ACCOUNT_INACTIVE
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    return AppResponse.fromDefinition(Responses.LOGIN_SUCCESS, result);
  }

  /**
   * Issues a new access + refresh token pair using a valid refresh token.
   * Route: POST /auth/refresh  |  Public (expired access tokens are expected here)
   *
   * Flow:
   * 1. AppValidationPipe validates RefreshTokenDto.refreshToken is present.
   * 2. decodeRefreshToken() Base64-decodes the JWT payload to extract `sub`
   *    (userId) without verifying signature or expiry — used only to identify
   *    which DB record to load for bcrypt comparison.
   * 3. Delegates to AuthService.refreshTokens(userId, rawToken) which loads
   *    the stored bcrypt hash, compares, then rotates the token pair.
   * 4. Returns HTTP 200 with the new AuthTokens.
   *
   * Throws:
   *  - 400 Error               — if the token string is not a valid JWT structure
   *  - 401 RefreshTokenInvalid — ERR_REFRESH_TOKEN_INVALID (AuthService)
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Refresh token invalid or expired' })
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    const payload = this.decodeRefreshToken(dto.refreshToken);
    const tokens = await this.authService.refreshTokens(payload.sub, dto.refreshToken);
    return AppResponse.fromDefinition(Responses.TOKEN_REFRESHED, tokens);
  }

  /**
   * Invalidates the current session by nullifying the stored refresh token.
   * Route: POST /auth/logout  |  Protected — requires valid Bearer token
   *
   * Flow:
   * 1. JwtAuthGuard validates the Bearer token and populates req.user via JwtStrategy.
   * 2. @CurrentUser() extracts the authenticated user's { id, email, role }.
   * 3. Delegates to AuthService.logout(userId) which sets refreshToken = null
   *    in the DB, preventing any future token refresh for this session.
   * 4. Returns HTTP 200 with data: null.
   *
   * Throws:
   *  - 401 UnauthorizedError — if the Bearer token is missing, expired, or invalid
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout current user' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.id);
    return AppResponse.fromDefinition(Responses.LOGOUT_SUCCESS);
  }

  /**
   * Decodes a JWT's payload segment without verifying signature or expiry.
   * Used exclusively by refreshTokens() to read the `sub` (userId) from
   * an incoming refresh token before passing it to AuthService for full
   * bcrypt validation.
   *
   * Algorithm:
   * 1. Split the token on '.' and take the second segment (payload).
   * 2. Base64-decode the segment and JSON.parse the result.
   * 3. Return the typed payload object { sub: string }.
   *
   * Throws: Error('Invalid refresh token format') if split/decode/parse fails.
   */
  private decodeRefreshToken(token: string): { sub: string } {
    try {
      const base64Payload = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8')) as {
        sub: string;
      };
      return payload;
    } catch {
      throw new Error('Invalid refresh token format');
    }
  }
}
