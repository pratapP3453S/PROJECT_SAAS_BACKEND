import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { APP_CONSTANTS } from '../../../../shared/constants/app.constants';
import { Errors } from '../../../../shared/constants/error.constants';
import { ApiError } from '../../../../core/exceptions/api.error';
import { JwtPayload } from '../../../../shared/types/jwt-payload.interface';
import { AuthRepository } from '../../infrastructure/prisma/auth.repository';
import { AuthResponse, AuthTokens, toPublicUser } from '../../domain/entities/auth.entity';
import { LoginDto } from '../../api/v1/dto/login.dto';
import { RegisterDto } from '../../api/v1/dto/register.dto';

/**
 * AuthService — application use-case orchestration for authentication.
 *
 * Responsibility: Owns credential verification, password hashing, token
 * generation, and session lifecycle. Contains no HTTP concerns.
 *
 * Layer: application/use-cases — coordinates the auth domain (AuthTokens /
 * AuthResponse), infrastructure (AuthRepository, JwtService, ConfigService),
 * and exposes a clean surface for the api/v1 controller. To version the
 * application behaviour (e.g. v2 issues opaque tokens via session), copy this
 * file under `application/use-cases/v2/` and wire it into a new submodule.
 *
 * Dependencies:
 *  - AuthRepository  : data access — users table (Prisma via PrismaService)
 *  - JwtService      : signs access and refresh tokens (@nestjs/jwt)
 *  - ConfigService   : reads jwt.secret, jwt.expiresIn, jwt.refreshSecret, etc.
 *
 * Token strategy:
 *  - Access token  : short-lived JWT (default 7d), contains { sub, email, role }
 *  - Refresh token : long-lived JWT (default 30d), contains { sub } only;
 *    stored as bcrypt hash in DB so plain token never persists at rest.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Creates a new user account and issues an initial token pair.
   * Called by: AuthController.register()
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.authRepository.findByEmail(dto.email.toLowerCase());
    if (existing) {
      throw ApiError.emailAlreadyExists();
    }

    const hashedPassword = await bcrypt.hash(dto.password, APP_CONSTANTS.BCRYPT_ROUNDS);

    const user = await this.authRepository.create({
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    await this.authRepository.updateLastLogin(user.id);

    this.logger.log(`New user registered: ${user.email}`);

    return { user: toPublicUser(user), tokens };
  }

  /**
   * Verifies credentials and issues a token pair for an existing user.
   * Called by: AuthController.login()
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.authRepository.findByEmail(dto.email.toLowerCase());

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw ApiError.invalidCredentials();
    }

    if (user.status === 'SUSPENDED') {
      throw ApiError.fromDefinition(Errors.ACCOUNT_SUSPENDED);
    }

    if (user.status === 'INACTIVE') {
      throw ApiError.fromDefinition(Errors.ACCOUNT_INACTIVE);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    await this.authRepository.updateLastLogin(user.id);

    this.logger.log(`User logged in: ${user.email}`);

    return { user: toPublicUser(user), tokens };
  }

  /**
   * Validates a refresh token and rotates the token pair (refresh token rotation).
   * Called by: AuthController.refreshTokens() — userId extracted from decoded JWT.
   */
  async refreshTokens(userId: string, rawRefreshToken: string): Promise<AuthTokens> {
    const user = await this.authRepository.findById(userId);
    if (!user || !user.refreshToken) {
      throw ApiError.fromDefinition(Errors.REFRESH_TOKEN_INVALID);
    }

    const tokenMatches = await bcrypt.compare(rawRefreshToken, user.refreshToken);
    if (!tokenMatches) {
      throw ApiError.fromDefinition(Errors.REFRESH_TOKEN_INVALID);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  /**
   * Invalidates the current session by clearing the stored refresh token hash.
   * Called by: AuthController.logout() — userId comes from the verified JWT.
   */
  async logout(userId: string): Promise<void> {
    await this.authRepository.updateRefreshToken(userId, null);
    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Signs an access token and a refresh token in parallel.
   */
  private async generateTokens(userId: string, email: string, role: string): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, role: role as never };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiresIn', '7d'),
      }),
      this.jwtService.signAsync(
        { sub: userId, jti: randomUUID() },
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn: this.configService.get<string>('jwt.refreshExpiresIn', '30d'),
        },
      ),
    ]);

    const expiresIn = 7 * 24 * 60 * 60;

    return { accessToken, refreshToken, expiresIn };
  }

  /**
   * Hashes a raw refresh token and persists it to the users table.
   */
  private async saveRefreshToken(userId: string, rawToken: string): Promise<void> {
    const hashed = await bcrypt.hash(rawToken, APP_CONSTANTS.BCRYPT_ROUNDS);
    await this.authRepository.updateRefreshToken(userId, hashed);
  }
}
