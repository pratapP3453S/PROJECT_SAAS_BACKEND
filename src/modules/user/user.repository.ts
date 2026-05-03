import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BaseRepository, PaginatedFindResult } from '../../database/repositories/base.repository';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * UserRepository — data access layer for user profile operations.
 *
 * Responsibility: Encapsulates Prisma queries for the users table that are
 * specific to the user feature module. Extends BaseRepository<User> for
 * generic CRUD (findById, update, softDelete, etc.) and adds user-specific
 * read/write methods.
 *
 * Table   : users (mapped via @@map in user.schema.prisma)
 * Model   : User (@prisma/client)
 * Inherits: BaseRepository<User> → src/database/repositories/base.repository.ts
 *
 * Methods:
 *  findByEmail(email)               : findFirst WHERE email = :email AND deleted_at IS NULL.
 *                                     Normalizes email to lower-case before querying.
 *  findAllPaginated(query, filters) : Paginated user list with optional role/status/search
 *                                     filters applied to a base WHERE deleted_at IS NULL.
 *                                     Search uses case-insensitive OR across firstName,
 *                                     lastName, email.
 *  updateAvatar(userId, avatarUrl)  : UPDATE users SET avatar = :url WHERE id = :userId.
 *                                     Called after a file is moved to permanent storage.
 *
 * Used by: UserService
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
  protected readonly modelName = 'user';

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Finds an active user by email address (case-insensitive, excludes soft-deleted).
   * Called by: (reserved — mirrors AuthRepository.findByEmail for non-auth lookups)
   *
   * Flow:
   * 1. Normalize email to lower-case.
   * 2. Prisma findFirst WHERE email = :email AND deleted_at IS NULL.
   * 3. Returns the full User row, or null if not found.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  /**
   * Returns a paginated, optionally-filtered list of active users.
   * Called by: UserService.findAll()
   *
   * Flow:
   * 1. Base WHERE: { deletedAt: null } — excludes soft-deleted records.
   * 2. Optional filters applied to `where`:
   *    - role   : exact Prisma Role enum match.
   *    - status : exact UserStatus enum match.
   *    - search : case-insensitive OR across firstName, lastName, email.
   * 3. Delegates to BaseRepository.findManyPaginated({ page, limit, where, orderBy })
   *    which runs findMany + count in parallel and returns { items, meta }.
   *
   * Note: Uses sortBy / sortOrder from PaginationDto; defaults to createdAt DESC.
   */
  async findAllPaginated(
    query: PaginationDto,
    filters: { role?: string; status?: string; search?: string } = {},
  ): Promise<PaginatedFindResult<User>> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: Record<string, unknown> = { deletedAt: null };

    if (filters.role) where['role'] = filters.role;
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.findManyPaginated({
      page,
      limit,
      where,
      orderBy: { [sortBy]: sortOrder },
    });
  }

  /**
   * Updates the avatar URL for a user record.
   * Called by: (Future) ProfileService or UploadService after a file is committed.
   *
   * Flow:
   * 1. Prisma UPDATE users SET avatar = :avatarUrl WHERE id = :userId.
   * 2. Returns the updated User row.
   */
  async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
    });
  }
}
