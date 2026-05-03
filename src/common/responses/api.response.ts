import { Response } from 'express';
import { HTTP_STATUS } from '../constants/http.constants';
import { ResponseDefinition } from '../constants/response.constants';

/**
 * PaginationMeta — cursor state for paginated list responses.
 * Attached to SuccessResponseBody.meta on any paginated endpoint.
 *
 * Computed by ApiResponse.buildMeta(total, page, limit).
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SuccessResponseBody<T = unknown> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
  timestamp: string;
  path?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * ApiResponse — static factory class for building standardized HTTP responses.
 *
 * Responsibility: Provides two sets of helpers:
 *  a) Express helpers (success, created, paginated, noContent) — write directly
 *     to the Express Response object. Used when a controller needs fine-grained
 *     control over the response outside of NestJS's return-value pipeline.
 *  b) Builder helpers (buildSuccess, buildPaginated, buildMeta) — return plain
 *     objects without touching the response. Used by ResponseInterceptor and
 *     anywhere that needs to construct an envelope without an Express reference.
 *
 * All success responses share the shape:
 *  { success: true, statusCode, message, data, [meta], timestamp, [path] }
 *
 * Used by:
 *  - ResponseInterceptor  : buildSuccess() wraps plain controller return values
 *  - BaseRepository       : buildMeta() computes pagination metadata
 *  - Controllers directly : success(), created(), paginated() for manual writes
 */
export class ApiResponse {
  // ─── Success ──────────────────────────────────────────────────────────────
  static success<T>(
    res: Response,
    message: string,
    data: T = null as unknown as T,
    statusCode: number = HTTP_STATUS.OK,
  ): void {
    res.status(statusCode).json(ApiResponse.buildSuccess(message, data, statusCode, res.req?.path));
  }

  static created<T>(res: Response, message: string, data: T): void {
    ApiResponse.success(res, message, data, HTTP_STATUS.CREATED);
  }

  static paginated<T>(res: Response, message: string, items: T[], meta: PaginationMeta): void {
    const body: SuccessResponseBody<T[]> = {
      success: true,
      statusCode: HTTP_STATUS.OK,
      message,
      data: items,
      meta,
      timestamp: new Date().toISOString(),
      path: res.req?.path,
    };
    res.status(HTTP_STATUS.OK).json(body);
  }

  static noContent(res: Response): void {
    res.status(HTTP_STATUS.NO_CONTENT).send();
  }

  // ─── Factory: From Response Definition ───────────────────────────────────
  static fromDefinition<T>(
    definition: ResponseDefinition,
    data: T = null as unknown as T,
    meta?: PaginationMeta | Record<string, unknown>,
  ): SuccessResponseBody<T> {
    const body = ApiResponse.buildSuccess(definition.message, data, definition.statusCode);
    return meta ? { ...body, meta } : body;
  }

  // ─── Builder (for interceptors / non-Express contexts) ────────────────────
  static buildSuccess<T>(
    message: string,
    data: T,
    statusCode: number = HTTP_STATUS.OK,
    path?: string,
  ): SuccessResponseBody<T> {
    return {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
      ...(path ? { path } : {}),
    };
  }

  static buildPaginated<T>(
    message: string,
    items: T[],
    meta: PaginationMeta,
    path?: string,
  ): SuccessResponseBody<T[]> {
    return {
      success: true,
      statusCode: HTTP_STATUS.OK,
      message,
      data: items,
      meta,
      timestamp: new Date().toISOString(),
      ...(path ? { path } : {}),
    };
  }

  // ─── Static Pagination Builder ────────────────────────────────────────────
  static buildMeta(total: number, page: number, limit: number): PaginationMeta {
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
}
