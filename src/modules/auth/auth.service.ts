import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { APP_CONSTANTS } from '../../common/constants/app.constants';
import { Errors } from '../../common/constants/error.constants';
import { ApiError } from '../../common/errors/api.error';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { AuthRepository } from './auth.repository';
import { AuthResponse, AuthTokens, toPublicUser } from './interfaces/auth.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * AuthService — business logic layer for all authentication operations.
 *
 * Responsibility: Owns credential verification, password hashing, token
 * generation, and session lifecycle. Contains no HTTP concerns.
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
   *
   * Flow:
   * 1. AuthRepository.findByEmail(email) — check uniqueness (excludes soft-deleted).
   *    Throws ApiError.emailAlreadyExists() [409] if a record exists.
   * 2. bcrypt.hash(password, BCRYPT_ROUNDS) — hash the plain-text password.
   * 3. AuthRepository.create({...}) — persist the new user row.
   * 4. generateTokens(id, email, role) — sign access + refresh JWT pair in parallel.
   * 5. saveRefreshToken(id, refreshToken) — bcrypt-hash and store the refresh token.
   * 6. AuthRepository.updateLastLogin(id) — stamp last_login_at = now().
   * 7. Return { user: PublicUser, tokens: AuthTokens } (password stripped via toPublicUser).
   *
   * Throws:
   *  - ApiError [409] ERR_EMAIL_ALREADY_EXISTS — duplicate email
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
   *
   * Flow:
   * 1. AuthRepository.findByEmail(email) — load user record (excludes soft-deleted).
   * 2. bcrypt.compare(plainPassword, user.password) — constant-time password check.
   *    If user not found OR password mismatch, throws a single generic 401
   *    (avoids leaking whether the email exists).
   * 3. Status guards — throws 403 for SUSPENDED or INACTIVE accounts before
   *    issuing any tokens.
   * 4. generateTokens(id, email, role) — sign access + refresh JWT pair in parallel.
   * 5. saveRefreshToken(id, refreshToken) — rotate: bcrypt-hash and store new token.
   * 6. AuthRepository.updateLastLogin(id) — stamp last_login_at = now().
   * 7. Return { user: PublicUser, tokens: AuthTokens }.
   *
   * Throws:
   *  - ApiError [401] ERR_INVALID_CREDENTIALS  — bad email or password
   *  - ApiError [403] ERR_ACCOUNT_SUSPENDED    — account suspended
   *  - ApiError [403] ERR_ACCOUNT_INACTIVE     — account inactive
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
   *
   * Flow:
   * 1. AuthRepository.findById(userId) — load user; throw [401] if not found
   *    or if no refresh token hash is stored (already logged out).
   * 2. bcrypt.compare(rawRefreshToken, user.refreshToken) — verify the incoming
   *    token against the stored hash. Throws [401] on mismatch (reused/stolen token).
   * 3. generateTokens(id, email, role) — issue a fresh access + refresh pair.
   * 4. saveRefreshToken(id, newRefreshToken) — overwrite the old hash (rotation).
   * 5. Return the new AuthTokens (no user object returned here).
   *
   * Throws:
   *  - ApiError [401] ERR_REFRESH_TOKEN_INVALID — user not found, no hash stored,
   *    or bcrypt comparison fails
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
   *
   * Flow:
   * 1. AuthRepository.updateRefreshToken(userId, null) — sets refresh_token = NULL
   *    in DB, making any existing refresh token permanently unusable.
   * 2. Logs the logout event.
   *
   * Note: The access token remains technically valid until expiry; clients must
   * discard it locally. Short access token TTL (7d default) limits the exposure window.
   */
  async logout(userId: string): Promise<void> {
    await this.authRepository.updateRefreshToken(userId, null);
    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Signs an access token and a refresh token in parallel.
   * Called by: register(), login(), refreshTokens()
   *
   * Flow:
   * 1. Build JwtPayload { sub: userId, email, role } for the access token.
   * 2. Promise.all — sign both tokens concurrently via JwtService.signAsync:
   *    - Access token  : full payload, jwt.secret,        expiresIn = jwt.expiresIn
   *    - Refresh token : { sub } only, jwt.refreshSecret, expiresIn = jwt.refreshExpiresIn
   * 3. Return AuthTokens { accessToken, refreshToken, expiresIn (seconds) }.
   *
   * Config keys read: jwt.secret, jwt.expiresIn, jwt.refreshSecret, jwt.refreshExpiresIn
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
   * Called by: register(), login(), refreshTokens()
   *
   * Flow:
   * 1. bcrypt.hash(rawToken, BCRYPT_ROUNDS) — hash with configured salt rounds.
   * 2. AuthRepository.updateRefreshToken(userId, hashedToken) — upsert the hash.
   *
   * Security: The plain-text token is never stored; only the bcrypt hash persists,
   * so a DB leak does not expose usable refresh tokens.
   */
  private async saveRefreshToken(userId: string, rawToken: string): Promise<void> {
    const hashed = await bcrypt.hash(rawToken, APP_CONSTANTS.BCRYPT_ROUNDS);
    await this.authRepository.updateRefreshToken(userId, hashed);
  }
}
