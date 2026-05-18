import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { ApiError } from '../../../../core/exceptions/api.error';
import { PaginationDto } from '../../../../shared/dto/pagination.dto';
import { CacheService } from '../../../../core/cache/cache.service';
import { UserRepository } from '../../infrastructure/prisma/user.repository';
import { PublicUserProfile } from '../../domain/entities/user.entity';
import { CACHE_KEYS } from '../../../../shared/constants/app.constants';
import { UpdateUserDto } from '../../api/v1/dto/update-user.dto';

/**
 * UserService — application use-case orchestration for user profile operations.
 *
 * Responsibility: Owns user retrieval, profile updates, and soft-deletion.
 * Implements a cache-aside pattern via CacheService so repeated profile
 * reads do not hit the database on every request.
 *
 * Layer: application/use-cases — coordinates domain entities (PublicUserProfile)
 * with infrastructure (UserRepository, CacheService). Controllers depend on
 * this class; this class never depends on controllers.
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
 * toPublicProfile(user): Maps a Prisma User to PublicUserProfile, stripping
 *  sensitive fields (password, refreshToken, etc.).
 *
 * Cache keys: CACHE_KEYS.USER(id) = 'user:{id}'
 * Used by: UserController (api/v1)
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
