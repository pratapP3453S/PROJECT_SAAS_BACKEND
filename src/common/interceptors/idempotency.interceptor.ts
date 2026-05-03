import * as crypto from 'crypto';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, from, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ApiError } from '../errors/api.error';
import { Errors } from '../constants/error.constants';

/**
 * TTL for client-keyed records (Idempotency-Key header present).
 * Within 24 hours, the same key + body replays the original response.
 */
const KEYED_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * TTL for hash-only records (no Idempotency-Key header).
 * Within 30 seconds, a duplicate body+path from the same operation is rejected.
 */
const HASH_TTL_MS = 30 * 1000;

/**
 * stableStringify — deterministic JSON serialization.
 *
 * Recursively sorts object keys so that `{b:2,a:1}` and `{a:1,b:2}` produce
 * the same string. This ensures the request hash is independent of key order
 * in the body, which can vary across clients / serializers.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * IdempotencyInterceptor — prevents duplicate POST request processing.
 *
 * Responsibility: Guards all POST endpoints against both intentional retries
 * (via Idempotency-Key) and accidental double-submits (via request hash).
 * Registered globally in AppModule — no per-controller annotation needed.
 *
 * Two protection modes:
 *
 *  1. Client-keyed (Idempotency-Key header present)
 *     ─────────────────────────────────────────────
 *     Client sends `Idempotency-Key: <uuid>` with a POST.
 *     - Key + matching hash found (not expired) → replay exact original response.
 *     - Key found but hash differs → 422 ERR_IDEMPOTENCY_KEY_MISMATCH
 *       (key reused with a different payload — indicates a client bug).
 *     - Key expired or not found → process normally, then store key + hash + response.
 *     - TTL: 24 hours.
 *
 *  2. Hash-only (no Idempotency-Key header)
 *     ───────────────────────────────────────
 *     Server computes a SHA-256 fingerprint of `method:path:stableBody`.
 *     - Same fingerprint found within 30-second window → 409 ERR_DUPLICATE_REQUEST.
 *     - Not found → process normally, then store hash + response.
 *     - TTL: 30 seconds (short-window double-submit protection).
 *
 * Request hash algorithm:
 *   SHA-256(`${method}:${path}:${stableStringify(body)}`)
 *   stableStringify recursively sorts object keys for body-order independence.
 *
 * Storage:
 *   IdempotencyRecord table via PrismaService (@Global() — always available).
 *   On P2002 (unique constraint race): silently ignored — concurrent request
 *   already stored the same key; both responses are identical.
 *   On any other storage error: logged as warning; original response is still
 *   returned (storage failure is non-fatal).
 *
 * Skips: non-POST methods (GET, DELETE, etc.).
 *
 * Used by: AppModule (APP_INTERCEPTOR provider)
 * See also:
 *   IdempotencyRecord → prisma/schema/idempotency.schema.prisma
 *   Errors            → src/common/constants/error.constants.ts
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (req.method !== 'POST' || this.isMultipartRequest(req)) {
      return next.handle();
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const requestHash = this.computeHash(req);

    return from(this.resolveExisting(idempotencyKey, requestHash)).pipe(
      switchMap((cached) => {
        if (cached) {
          // ── Replay ──────────────────────────────────────────────────────
          res.status(cached.statusCode);
          return of(cached.responseBody);
        }

        // ── Process + Store ─────────────────────────────────────────────
        return next.handle().pipe(
          switchMap((responseBody) =>
            from(this.storeRecord(idempotencyKey, requestHash, res.statusCode, responseBody)).pipe(
              map(() => responseBody),
              catchError((err: Error) => {
                this.logger.warn(
                  `Idempotency record storage failed — response still returned. Error: ${err.message}`,
                );
                return of(responseBody);
              }),
            ),
          ),
        );
      }),
    );
  }

  // ─── Hash ───────────────────────────────────────────────────────────────────

  private computeHash(req: Request): string {
    const fingerprint = `${req.method}:${req.path}:${stableStringify(req.body ?? {})}`;
    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  }

  private isMultipartRequest(req: Request): boolean {
    return (req.headers['content-type'] ?? '').toLowerCase().startsWith('multipart/form-data');
  }

  // ─── DB Lookup ──────────────────────────────────────────────────────────────

  private async resolveExisting(
    idempotencyKey: string | undefined,
    requestHash: string,
  ): Promise<{ statusCode: number; responseBody: unknown } | null> {
    const now = new Date();

    if (idempotencyKey) {
      return this.resolveKeyed(idempotencyKey, requestHash, now);
    }

    return this.resolveHashOnly(requestHash, now);
  }

  private async resolveKeyed(
    idempotencyKey: string,
    requestHash: string,
    now: Date,
  ): Promise<{ statusCode: number; responseBody: unknown } | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey },
    });

    if (!record) return null;

    // Expired — delete stale record and treat as fresh
    if (record.expiresAt < now) {
      await this.prisma.idempotencyRecord.delete({ where: { idempotencyKey } }).catch(() => {
        /* ignore race on delete */
      });
      return null;
    }

    // Same key, different payload — client bug
    if (record.requestHash !== requestHash) {
      throw ApiError.fromDefinition(Errors.IDEMPOTENCY_KEY_MISMATCH, {
        details: `Key '${idempotencyKey}' was previously used with a different request body.`,
      });
    }

    // Valid replay
    return { statusCode: record.statusCode, responseBody: record.responseBody };
  }

  private async resolveHashOnly(
    requestHash: string,
    now: Date,
  ): Promise<{ statusCode: number; responseBody: unknown } | null> {
    const windowStart = new Date(now.getTime() - HASH_TTL_MS);

    const record = await this.prisma.idempotencyRecord.findFirst({
      where: {
        requestHash,
        idempotencyKey: null,
        createdAt: { gte: windowStart },
        expiresAt: { gt: now },
      },
    });

    if (record) {
      throw ApiError.fromDefinition(Errors.DUPLICATE_REQUEST, {
        details: 'Identical request received within the 30-second duplicate-detection window.',
      });
    }

    return null;
  }

  // ─── DB Write ───────────────────────────────────────────────────────────────

  private async storeRecord(
    idempotencyKey: string | undefined,
    requestHash: string,
    statusCode: number,
    responseBody: unknown,
  ): Promise<void> {
    const ttlMs = idempotencyKey ? KEYED_TTL_MS : HASH_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs);

    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          idempotencyKey: idempotencyKey ?? null,
          requestHash,
          statusCode,
          responseBody: responseBody as object,
          expiresAt,
        },
      });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      // P2002 — unique constraint: concurrent request stored the same key first.
      // Both requests produced the same response so this is safe to ignore.
      if (prismaErr.code !== 'P2002') {
        throw err;
      }
    }
  }
}
