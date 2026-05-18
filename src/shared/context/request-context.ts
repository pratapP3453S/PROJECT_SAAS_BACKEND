import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * RequestContext — per-request diagnostic store.
 *
 * Why this exists
 *  Enterprise responses ship more than just `data`. They ship correlation IDs,
 *  end-to-end latency, DB time, cache hit/miss counters, server identity — the
 *  same shape Axios returns for HTTP responses (data + headers + config + …).
 *  All of those values need to be collected throughout the request lifecycle
 *  (DB query firings, cache hits, etc.) and stamped onto the final envelope.
 *
 *  We can't pass a "context" object into every Prisma call or cache call by
 *  hand, so we use Node's AsyncLocalStorage. The HTTP middleware enters the
 *  ALS at the top of the request; downstream code anywhere in the call tree
 *  can call RequestContext.current() and mutate the same object. When the
 *  response interceptor / exception filter render the envelope, they read the
 *  accumulated state in O(1).
 *
 * What lives here
 *  - requestId, method, path, apiVersion       — request identity
 *  - startedAt, finishedAt                     — wall-clock times
 *  - dbTimeMs, dbQueries                       — Prisma $on('query') aggregates
 *  - cacheTimeMs, cacheOps, cacheHits, misses  — CacheService counters
 *  - externalTimeMs, externalCalls             — for future axios/http hooks
 *  - tags                                      — free-form bag for ad-hoc additions
 *
 * Public API (static)
 *  RequestContext.run(seed, fn)   → enter the ALS for one request
 *  RequestContext.current()       → typed accessor (returns undefined outside)
 *  RequestContext.recordDb(ms)    → atomic DB timing increment
 *  RequestContext.recordCache(...)→ atomic cache counters
 *  RequestContext.recordExternal(ms)
 *
 * Performance
 *  AsyncLocalStorage is essentially free for HTTP request scopes — Node 22 has
 *  fast-path implementations and there's only one ALS per process here. We
 *  avoid a per-request Map by using a single typed object.
 *
 * Lives in `shared/` because it has zero framework / infrastructure deps —
 * pure Node primitive. Consumed by `core/middleware` (entry point) and by
 * any service that needs to record metrics into the active request scope.
 */

export interface RequestContextData {
  requestId: string;
  method?: string;
  path?: string;
  apiVersion?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;

  /** High-resolution start time (ms since process start). */
  startedAtPerf: number;
  /** Wall-clock start (epoch ms). */
  startedAtEpoch: number;
  /** Filled by the response interceptor / exception filter at send time. */
  finishedAtPerf?: number;

  // Aggregated timings
  dbTimeMs: number;
  dbQueries: number;
  cacheTimeMs: number;
  cacheOps: number;
  cacheHits: number;
  cacheMisses: number;
  externalTimeMs: number;
  externalCalls: number;

  /** Anything else a service wants to surface. Stays free-form on purpose. */
  tags: Record<string, unknown>;
}

const als = new AsyncLocalStorage<RequestContextData>();

export class RequestContext {
  /** Wrap an entire request in the ALS so any downstream code can read it. */
  static run<T>(seed: Partial<RequestContextData>, fn: () => T): T {
    const ctx: RequestContextData = {
      requestId: seed.requestId ?? randomUUID(),
      method: seed.method,
      path: seed.path,
      apiVersion: seed.apiVersion,
      ip: seed.ip,
      userAgent: seed.userAgent,
      userId: seed.userId,
      startedAtPerf: performance.now(),
      startedAtEpoch: Date.now(),
      dbTimeMs: 0,
      dbQueries: 0,
      cacheTimeMs: 0,
      cacheOps: 0,
      cacheHits: 0,
      cacheMisses: 0,
      externalTimeMs: 0,
      externalCalls: 0,
      tags: {},
    };
    return als.run(ctx, fn);
  }

  /** Returns the active context if we're inside als.run(), otherwise undefined. */
  static current(): RequestContextData | undefined {
    return als.getStore();
  }

  /** Update fields on the active context. No-op outside a request. */
  static patch(patch: Partial<RequestContextData>): void {
    const ctx = als.getStore();
    if (!ctx) return;
    Object.assign(ctx, patch);
  }

  /** Mark a tag for inclusion in `meta.tags`. */
  static tag(key: string, value: unknown): void {
    const ctx = als.getStore();
    if (!ctx) return;
    ctx.tags[key] = value;
  }

  // ─── Hooks called by infrastructure ──────────────────────────────────────

  static recordDb(durationMs: number): void {
    const ctx = als.getStore();
    if (!ctx) return;
    ctx.dbQueries += 1;
    ctx.dbTimeMs += durationMs;
  }

  static recordCache(opts: {
    durationMs: number;
    hit?: boolean;
    miss?: boolean;
  }): void {
    const ctx = als.getStore();
    if (!ctx) return;
    ctx.cacheOps += 1;
    ctx.cacheTimeMs += opts.durationMs;
    if (opts.hit) ctx.cacheHits += 1;
    if (opts.miss) ctx.cacheMisses += 1;
  }

  static recordExternal(durationMs: number): void {
    const ctx = als.getStore();
    if (!ctx) return;
    ctx.externalCalls += 1;
    ctx.externalTimeMs += durationMs;
  }

  /** Stamp finishedAt — called by ResponseInterceptor / AllExceptionsFilter. */
  static finish(): RequestContextData | undefined {
    const ctx = als.getStore();
    if (!ctx) return undefined;
    ctx.finishedAtPerf = performance.now();
    return ctx;
  }
}
