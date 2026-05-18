import { Response } from 'express';
import { hostname } from 'node:os';
import { HTTP_STATUS } from '../constants/http.constants';
import { ResponseDefinition } from '../constants/response.constants';
import { RequestContext, RequestContextData } from '../context/request-context';

/**
 * PaginationMeta — cursor state for paginated list responses.
 * Computed by ApiResponse.buildPaginationMeta(total, page, limit).
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * RequestMeta — who/what/when of the inbound request. Lets clients correlate a
 * response with their own logs without parsing headers.
 */
export interface RequestMeta {
  /** Stable id (uuid v4) — same value as the X-Request-Id response header. */
  requestId: string;
  method: string;
  path: string;
  apiVersion?: string;
  ip?: string;
  userAgent?: string;
  /** Authenticated user id (when JwtAuthGuard set it). */
  userId?: string;
}

/**
 * TimingMeta — end-to-end latency breakdown collected during the request.
 * All times are milliseconds. Counts default to 0 (never absent) so dashboards
 * can chart them without null-handling.
 */
export interface TimingMeta {
  /** Wall-clock time from middleware entry to response render. */
  totalMs: number;
  /** Aggregate Prisma query time (sum of every $on('query').duration). */
  dbMs: number;
  dbQueries: number;
  /** Aggregate cache I/O time across get/set/del/invalidate. */
  cacheMs: number;
  cacheOps: number;
  cacheHits: number;
  cacheMisses: number;
  /** External HTTP calls (axios/fetch) timing — populated when the optional
   *  axios interceptor is wired. */
  externalMs: number;
  externalCalls: number;
}

/**
 * ServerMeta — identity of the process that handled the request. Useful when
 * tracing a flaky response to a specific pod/container.
 */
export interface ServerMeta {
  hostname: string;
  pid: number;
  env: string;
  nodeVersion: string;
  region?: string;
  appVersion?: string;
}

/**
 * SuccessResponseBody — the canonical success envelope.
 *
 * Top-level fields stay flat (à la Axios's response object) so callers can
 * destructure cheaply: `const { data, timing, request } = res.data;`.
 *
 * Backwards compatibility
 *  `meta` is preserved and still carries `PaginationMeta` for paginated lists.
 *  All new diagnostic fields (`request`, `timing`, `server`) are *additive* —
 *  no existing consumer is broken by their presence.
 */
export interface SuccessResponseBody<T = unknown> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  /** Pagination only — present on list endpoints. */
  meta?: PaginationMeta;
  /** Diagnostic envelope — always present when the request went through the
   *  RequestContextMiddleware (i.e. all HTTP requests). */
  request?: RequestMeta;
  timing?: TimingMeta;
  server?: ServerMeta;
  /** Free-form bag — anything pushed via RequestContext.tag(...). */
  tags?: Record<string, unknown>;
  timestamp: string;
  path?: string;
}

/**
 * ErrorResponseBody — the canonical error envelope. Same diagnostic fields as
 * the success envelope, so client code can read `timing` / `request` / `server`
 * uniformly regardless of `success`.
 */
export interface ErrorResponseBody {
  success: false;
  statusCode: number;
  error: {
    name: string;
    code: string;
    message: string;
    details?: string;
    fields?: Array<{ field: string; message: string; constraint?: string; value?: unknown }>;
    /** Stack trace — emitted only outside production. */
    stack?: string;
  };
  request?: RequestMeta;
  timing?: TimingMeta;
  server?: ServerMeta;
  tags?: Record<string, unknown>;
  timestamp: string;
  path?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * ApiResponse — static factory for success envelopes.
 *
 * Two surfaces:
 *  a) Express helpers (success, created, paginated, noContent) — write directly.
 *  b) Builder helpers (buildSuccess, buildPaginated, buildPaginationMeta) —
 *     return plain objects, used by ResponseInterceptor and BaseRepository.
 *
 * Diagnostic fields (request/timing/server) are attached automatically by
 * `attachDiagnostics(body)`, which reads the active RequestContext. Builders
 * that don't have access to a RequestContext (used in tests, batch jobs, etc.)
 * still produce a valid-but-thinner envelope without diagnostics.
 */
export class ApiResponse {
  // ─── Express helpers ──────────────────────────────────────────────────────

  static success<T>(
    res: Response,
    message: string,
    data: T = null as unknown as T,
    statusCode: number = HTTP_STATUS.OK,
  ): void {
    const body = ApiResponse.attachDiagnostics(
      ApiResponse.buildSuccess(message, data, statusCode, res.req?.path),
    );
    res.status(statusCode).json(body);
  }

  static created<T>(res: Response, message: string, data: T): void {
    ApiResponse.success(res, message, data, HTTP_STATUS.CREATED);
  }

  static paginated<T>(res: Response, message: string, items: T[], meta: PaginationMeta): void {
    const body = ApiResponse.attachDiagnostics(
      ApiResponse.buildPaginated(message, items, meta, res.req?.path),
    );
    res.status(HTTP_STATUS.OK).json(body);
  }

  static noContent(res: Response): void {
    res.status(HTTP_STATUS.NO_CONTENT).send();
  }

  // ─── Builders (envelope only — no Express dependency) ─────────────────────

  static fromDefinition<T>(
    definition: ResponseDefinition,
    data: T = null as unknown as T,
    meta?: PaginationMeta,
  ): SuccessResponseBody<T> {
    const body = ApiResponse.buildSuccess(definition.message, data, definition.statusCode);
    return meta ? { ...body, meta } : body;
  }

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

  /**
   * Compose pagination meta from raw counts. Kept under the same name a long
   * time — used by BaseRepository.
   */
  static buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
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
  /** @deprecated kept for backwards compatibility — use buildPaginationMeta. */
  static buildMeta(total: number, page: number, limit: number): PaginationMeta {
    return ApiResponse.buildPaginationMeta(total, page, limit);
  }

  // ─── Diagnostic stamp ─────────────────────────────────────────────────────

  /**
   * Attach `request`, `timing`, `server`, and `tags` to a response body using
   * the active RequestContext. Mutates and returns the same object.
   *
   * Called by:
   *  - The Express helpers above (success / paginated / created)
   *  - ResponseInterceptor (for handlers that return raw envelopes)
   *  - AllExceptionsFilter (for error envelopes — also accepts ErrorResponseBody)
   */
  static attachDiagnostics<B extends SuccessResponseBody | ErrorResponseBody>(body: B): B {
    const ctx = RequestContext.finish();
    const server = buildServerMeta();
    if (!ctx) {
      // Outside an HTTP request (e.g. fixture/test). Still emit ServerMeta so
      // dashboards have hostname/env even for synthetic traffic.
      body.server = server;
      return body;
    }
    body.request = buildRequestMeta(ctx);
    body.timing = buildTimingMeta(ctx);
    body.server = server;
    if (Object.keys(ctx.tags).length > 0) body.tags = { ...ctx.tags };
    return body;
  }
}

// ─── Helpers (module-private) ───────────────────────────────────────────────

function buildRequestMeta(ctx: RequestContextData): RequestMeta {
  return {
    requestId: ctx.requestId,
    method: ctx.method ?? 'UNKNOWN',
    path: ctx.path ?? '',
    apiVersion: ctx.apiVersion,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    userId: ctx.userId,
  };
}

function buildTimingMeta(ctx: RequestContextData): TimingMeta {
  const finishedAt = ctx.finishedAtPerf ?? performance.now();
  const totalMs = roundMs(finishedAt - ctx.startedAtPerf);
  return {
    totalMs,
    dbMs: roundMs(ctx.dbTimeMs),
    dbQueries: ctx.dbQueries,
    cacheMs: roundMs(ctx.cacheTimeMs),
    cacheOps: ctx.cacheOps,
    cacheHits: ctx.cacheHits,
    cacheMisses: ctx.cacheMisses,
    externalMs: roundMs(ctx.externalTimeMs),
    externalCalls: ctx.externalCalls,
  };
}

// Cache the immutable bits — process-wide values that never change.
let cachedServerMeta: ServerMeta | undefined;
function buildServerMeta(): ServerMeta {
  if (cachedServerMeta) return { ...cachedServerMeta };
  cachedServerMeta = {
    hostname: hostname(),
    pid: process.pid,
    env: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    region: process.env.AWS_REGION || process.env.LOCAL_REGION || undefined,
    appVersion: process.env.APP_VERSION || undefined,
  };
  return { ...cachedServerMeta };
}

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100; // 2 decimal places
}
