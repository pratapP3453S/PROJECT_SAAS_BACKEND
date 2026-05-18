import { PrismaService } from '../prisma/prisma.service';
import { ApiResponse, PaginationMeta } from '../../../shared/responses/api.response';

/**
 * FindManyOptions — query options accepted by BaseRepository.findMany()
 * and findManyPaginated().
 *
 * page / limit   : 1-based pagination (converted to skip/take internally).
 * skip / take    : raw Prisma offset/count; used when page/limit are not needed.
 * where          : Prisma filter object (model-agnostic via Record<string, unknown>).
 * orderBy        : single or array of Prisma sort objects.
 * include        : eager-load relations.
 * select         : field projection (mutually exclusive with include in Prisma).
 */
export interface FindManyOptions {
  page?: number;
  limit?: number;
  skip?: number;
  take?: number;
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

export interface PaginatedFindResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * BaseRepository<T> — generic data access layer for all Prisma models.
 *
 * Responsibility: Provides standard CRUD operations, pagination, soft-delete,
 * and existence checks without repeating boilerplate in every feature repository.
 * Feature repositories extend this class and set `modelName` to the Prisma
 * model accessor name (e.g. 'user', 'upload').
 *
 * Dynamic model access:
 *  The `model` getter casts PrismaService to `any` and indexes by `modelName`.
 *  This is intentional — Prisma exposes each model under its camelCase name
 *  (prisma.user, prisma.upload, etc.) and TypeScript cannot index a union of
 *  model delegates with a runtime string. The repository subclass is always
 *  typed as BaseRepository<User> / BaseRepository<Upload>, so the return types
 *  are still correct at the call site.
 *
 * Methods:
 *  findById(id, include?)          → findUnique WHERE id = :id
 *  findOne(where, include?)        → findFirst with arbitrary filter
 *  findMany(options)               → findMany with optional filters, order, relations
 *  findManyPaginated(options)      → findMany + count in parallel → items + PaginationMeta
 *  create(data)                    → INSERT
 *  update(id, data)                → UPDATE WHERE id = :id
 *  upsert(where, create, update)   → INSERT or UPDATE
 *  delete(id)                      → hard DELETE WHERE id = :id
 *  softDelete(id)                  → UPDATE SET deleted_at = NOW()
 *  restore(id)                     → UPDATE SET deleted_at = NULL
 *  count(where?)                   → SELECT COUNT(*)
 *  exists(where)                   → SELECT id LIMIT 1 → boolean
 *
 * Used by: every feature repository (AuthRepository, UserRepository, …).
 * See also: PrismaService → src/core/database/prisma/prisma.service.ts
 */
export abstract class BaseRepository<T> {
  protected abstract readonly modelName: string;

  constructor(protected readonly prisma: PrismaService) {}

  /**
   * model — dynamic Prisma model delegate resolved at runtime via modelName.
   * Returns the full Prisma model API (findUnique, create, update, etc.).
   */
  protected get model() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as any)[this.modelName];
  }

  async findById(id: string, include?: Record<string, unknown>): Promise<T | null> {
    return this.model.findUnique({
      where: { id },
      ...(include ? { include } : {}),
    });
  }

  async findOne(
    where: Record<string, unknown>,
    include?: Record<string, unknown>,
  ): Promise<T | null> {
    return this.model.findFirst({
      where,
      ...(include ? { include } : {}),
    });
  }

  async findMany(options: FindManyOptions = {}): Promise<T[]> {
    const { where, orderBy, include, select, skip, take } = options;
    return this.model.findMany({
      ...(where ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
      ...(include ? { include } : {}),
      ...(select ? { select } : {}),
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    });
  }

  async findManyPaginated(options: FindManyOptions = {}): Promise<PaginatedFindResult<T>> {
    const { page = 1, limit = 10, where, orderBy, include, select } = options;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.model.findMany({
        skip,
        take: limit,
        ...(where ? { where } : {}),
        ...(orderBy ? { orderBy } : {}),
        ...(include ? { include } : {}),
        ...(select ? { select } : {}),
      }),
      this.model.count({ where }),
    ]);

    const meta = ApiResponse.buildMeta(total, page, limit);
    return { items, meta };
  }

  async create(data: Partial<T>): Promise<T> {
    return this.model.create({ data });
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    return this.model.update({ where: { id }, data });
  }

  async upsert(where: Record<string, unknown>, create: Partial<T>, update: Partial<T>): Promise<T> {
    return this.model.upsert({ where, create, update });
  }

  async delete(id: string): Promise<T> {
    return this.model.delete({ where: { id } });
  }

  async softDelete(id: string): Promise<T> {
    return this.model.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(id: string): Promise<T> {
    return this.model.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.model.count({ where });
  }

  async exists(where: Record<string, unknown>): Promise<boolean> {
    const record = await this.model.findFirst({ where, select: { id: true } });
    return record !== null;
  }
}
