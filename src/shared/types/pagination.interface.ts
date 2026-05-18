/**
 * pagination.interface — type contracts for paginated query inputs and responses.
 *
 * PaginationQuery : matches PaginationDto fields (page, limit, sortBy, sortOrder, search).
 * PaginatedResponse<T> : items + meta wrapper used by services and serializers.
 * OrderByClause   : a thin alias for Prisma orderBy maps.
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface OrderByClause {
  [key: string]: 'asc' | 'desc';
}
