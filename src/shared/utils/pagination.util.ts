import { PaginationMeta } from '../../common/responses/api.response';

/**
 * pagination.util — pure pagination helper functions.
 *
 * Responsibility: Converts page/limit inputs into Prisma skip/take values and
 * builds PaginationMeta objects. Used independently of the ORM so these helpers
 * can be unit-tested without a database.
 *
 * Functions:
 *  getPaginationParams(params): Clamps page ≥ 1 and limit to [1, 100], then
 *    returns { skip, take } suitable for Prisma findMany calls.
 *
 *  buildPaginationMeta(total, page, limit): Computes PaginationMeta from a
 *    total record count + the current page/limit. Used when building paginated
 *    API responses outside of BaseRepository (e.g., raw queries).
 *
 *  buildOrderBy(sortBy?, sortOrder?, defaultSort?): Constructs a Prisma orderBy
 *    object. Falls back to `defaultSort` ({ createdAt: 'desc' }) when sortBy is
 *    not provided — prevents unordered results in paginated lists.
 *
 * Note: BaseRepository.findManyPaginated() computes skip/take inline; this file
 * is available for service-layer callers that need the same logic without going
 * through the repository.
 *
 * Used by: Services that build custom Prisma queries outside BaseRepository.
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PrismaSkipTake {
  skip: number;
  take: number;
}

export function getPaginationParams(params: PaginationParams): PrismaSkipTake {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 10));
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
  defaultSort: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' },
): Record<string, 'asc' | 'desc'> {
  if (!sortBy) return defaultSort;
  return { [sortBy]: sortOrder };
}
