import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { ApiError } from '../../common/errors/api.error';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CacheService } from '../../shared/services/cache.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PublicUserProfile } from './interfaces/user.interface';
import { UserRepository } from './user.repository';
import { CACHE_KEYS } from '../../common/constants/app.constants';

/**
 * UserService — business logic layer for user profile operations.
 *
 * Responsibility: Owns user retrieval, profile updates, and soft-deletion.
 * Implements a cache-aside pattern via CacheService so repeated profile
 * reads do not hit the database on every request.
 *
 * Dependencies:
 *  - UserRepository : data access — users table (Prisma via PrismaService)
 *  - CacheService   : Redis-backed cache for user profiles (TTL: 300s)
 *
 * Methods:
 *  findById(id)           : Cache-aside lookup. Cache hit → return cached profile.
 *                           Cache miss → DB query, serialize, cache, return.
 *                           Throws 404 if not found or soft-deleted.
 *  findAll(query, filters): Paginated list with optional role/status/search filters.
 *                           Strips sensitive fields; no cache (admin listing).
 *  update(userId, dto)    : Updates the user record, invalidates the cached profile,
 *                           returns the sanitized public profile.
 *  remove(userId)         : Soft-deletes (sets deleted_at) and invalidates cache.
 *                           Throws 404 if not found or already deleted.
 *
 * toPublicProfile(user): Strips sensitive fields (password, refreshToken, etc.)
 *  via stripSensitiveFields() and maps to the PublicUserProfile shape.
 *
 * Cache keys: CACHE_KEYS.USER(id) = 'user:{id}'
 * Used by: UserController
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Returns a user's public profile by ID using cache-aside.
   * Called by: UserController.getMe(), UserController.findOne()
   *
   * Flow:
   * 1. Build cache key CACHE_KEYS.USER(id) = 'user:{id}'.
   * 2. CacheService.get() — return cached profile if present (TTL: 300s).
   * 3. UserRepository.findById(id) — DB lookup on cache miss.
   * 4. Throw 404 ERR_USER_NOT_FOUND if not found or soft-deleted.
   * 5. toPublicProfile(user) — strip sensitive fields, map to PublicUserProfile.
   * 6. CacheService.set(key, profile, 300) — populate cache for subsequent reads.
   *
   * Throws:
   *  - ApiError [404] ERR_USER_NOT_FOUND — user absent or deletedAt is set
   */
  async findById(id: string): Promise<PublicUserProfile> {
    const cacheKey = CACHE_KEYS.USER(id);

    const cached = await this.cacheService.get<PublicUserProfile>(cacheKey);
    if (cached) return cached;

    const user = await this.userRepository.findById(id);
    if (!user || user.deletedAt) {
      throw ApiError.userNotFound();
    }

    const profile = this.toPublicProfile(user);
    await this.cacheService.set(cacheKey, profile, 300);
    return profile;
  }

  /**
   * Returns a paginated list of active users with optional filters.
   * Called by: UserController.findAll()
   *
   * Flow:
   * 1. UserRepository.findAllPaginated(query, filters) — Prisma findMany with
   *    WHERE deleted_at IS NULL + optional role/status/search conditions.
   * 2. Map each User through toPublicProfile() to strip sensitive fields.
   * 3. Return { items: PublicUserProfile[], meta: PaginationMeta }.
   *
   * Note: No caching — admin list queries vary by filter/page and are low-frequency.
   */
  async findAll(
    query: PaginationDto,
    filters: { role?: string; status?: string; search?: string } = {},
  ) {
    const { items, meta } = await this.userRepository.findAllPaginated(query, filters);
    return {
      items: items.map((u) => this.toPublicProfile(u)),
      meta,
    };
  }

  /**
   * Updates allowed profile fields for a user and invalidates their cache entry.
   * Called by: UserController.updateMe(), UserController.updateUser()
   *
   * Flow:
   * 1. UserRepository.findById(userId) — existence guard; throw 404 if gone.
   * 2. UserRepository.update(userId, dto) — Prisma UPDATE with the DTO fields.
   * 3. CacheService.del(CACHE_KEYS.USER(userId)) — force fresh load on next read.
   * 4. Return toPublicProfile(updated) — the freshly updated public shape.
   *
   * Throws:
   *  - ApiError [404] ERR_USER_NOT_FOUND — user absent or soft-deleted
   */
  async update(userId: string, dto: UpdateUserDto): Promise<PublicUserProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.deletedAt) {
      throw ApiError.userNotFound();
    }

    const updated = await this.userRepository.update(userId, dto as Partial<User>);

    // Invalidate cache
    await this.cacheService.del(CACHE_KEYS.USER(userId));

    this.logger.log(`User profile updated: ${userId}`);
    return this.toPublicProfile(updated);
  }

  /**
   * Soft-deletes a user and removes them from cache.
   * Called by: UserController.remove()
   *
   * Flow:
   * 1. UserRepository.findById(userId) — existence guard; throw 404 if absent.
   * 2. UserRepository.softDelete(userId) — sets deleted_at = NOW() via BaseRepository.
   * 3. CacheService.del(CACHE_KEYS.USER(userId)) — remove stale cached profile.
   *
   * Note: Hard delete is intentionally not exposed. Soft-deleted users are
   * excluded from all queries via deletedAt IS NULL and cannot authenticate.
   *
   * Throws:
   *  - ApiError [404] ERR_USER_NOT_FOUND — user absent or already soft-deleted
   */
  async remove(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.deletedAt) {
      throw ApiError.userNotFound();
    }

    await this.userRepository.softDelete(userId);
    await this.cacheService.del(CACHE_KEYS.USER(userId));
    this.logger.log(`User soft-deleted: ${userId}`);
  }

  /**
   * Maps a full Prisma User to the API-safe PublicUserProfile shape.
   *
   * Flow:
   * 1. stripSensitiveFields(user) — removes password, refreshToken,
   *    passwordResetToken from a shallow copy of the object.
   * 2. Map the remaining fields to PublicUserProfile (role and status
   *    are read directly from the original `user` to keep enum types).
   */
  private toPublicProfile(user: User): PublicUserProfile {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? null,
      avatar: user.avatar ?? null,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
