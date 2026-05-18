import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../../core/decorators/current-user.decorator';
import { Public } from '../../../../../core/decorators/public.decorator';
import { JwtAuthGuard } from '../../../../../core/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../../../../shared/types/request.interface';
import { Responses } from '../../../../../shared/constants/response.constants';
import { ApiResponse as AppResponse } from '../../../../../shared/responses/api.response';
import { AuthService } from '../../../application/use-cases/auth.service';
import { LoginDto, RefreshTokenDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';

/**
 * AuthController — HTTP entry point for all authentication flows.
 *
 * Layer: api/v1 — request/response shaping only, no business logic. Delegates
 * every operation to AuthService (application/use-cases).
 *
 * Route prefix : v1/auth  (URI versioning configured in main.ts)
 * Guard        : Routes are @Public() by default here; logout uses @JwtAuthGuard.
 * Dependencies : AuthService (application layer)
 * DTOs         : RegisterDto, LoginDto, RefreshTokenDto (api/v1/dto)
 */
@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers a new user account and returns tokens on success.
   * Route: POST /v1/auth/register  |  Public (no auth required)
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
   * Route: POST /v1/auth/login  |  Public (no auth required)
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
   * Route: POST /v1/auth/refresh  |  Public (expired access tokens are expected here)
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
   * Route: POST /v1/auth/logout  |  Protected — requires valid Bearer token
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
