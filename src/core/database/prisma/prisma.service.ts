import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { RequestContext } from '../../../shared/context/request-context';

/**
 * PrismaService — database client wrapper (composition pattern).
 *
 * Responsibility: Provides a single, lifecycle-managed Prisma client instance
 * to the entire application. Exposed as a @Global() provider via PrismaModule
 * so no module needs to import PrismaModule explicitly.
 *
 * Why composition, not inheritance:
 *  Prisma 7 requires passing the pg adapter at PrismaClient construction time.
 *  Extending PrismaClient breaks the prototype chain when the adapter is used,
 *  causing `$connect`, model accessors, and `$on` to disappear from the subclass.
 *  Solution: wrap a private `_client` and expose everything via explicit getters
 *  and bound method delegates.
 *
 * Lifecycle:
 *  onModuleInit()    → $connect(); in development, subscribes to 'query' events
 *                      to log SQL + duration via Logger.debug().
 *  onModuleDestroy() → $disconnect(); graceful shutdown (Docker SIGTERM, tests).
 *
 * Model accessors  : user, upload, auditLog — add one getter per Prisma model.
 * Method delegates : $queryRaw, $queryRawUnsafe, $executeRaw, $executeRawUnsafe,
 *                    $transaction — bound to _client so `this` resolves correctly.
 *
 * cleanDatabase()  : truncates all public tables; guards against production call.
 *                    Used in E2E test setup to reset state between test suites.
 *
 * Used by: BaseRepository (all repositories), PrismaHealthIndicator (health check)
 * Config : DATABASE_URL must be set in the environment (validated by env.config.ts)
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly _client: PrismaClient;
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });

    this._client = new PrismaClient({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this._client.$connect();
    this.logger.log('✅ Database connected successfully');

    // Always-on hook: feed every query's duration into the active RequestContext
    // so the response/error envelope can report `timing.dbMs` and
    // `timing.dbQueries` end-to-end. Cheap (single function call per query).
    // The dev-only debug log is preserved alongside the metric record.
    (this._client.$on as (event: 'query', cb: (e: Prisma.QueryEvent) => void) => void)(
      'query',
      (e) => {
        RequestContext.recordDb(e.duration);
        if (process.env.NODE_ENV === 'development') {
          this.logger.debug(`Query: ${e.query} (${e.duration}ms)`);
        }
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this._client.$disconnect();
    this.logger.log('Database disconnected');
  }

  // ─── Model Accessors ──────────────────────────────────────────────────────
  // Add a getter here for every model defined in your Prisma schema.

  get user(): PrismaClient['user'] {
    return this._client.user;
  }

  get upload(): PrismaClient['upload'] {
    return this._client.upload;
  }

  get auditLog(): PrismaClient['auditLog'] {
    return this._client.auditLog;
  }

  get idempotencyRecord() {
    return (this._client as any).idempotencyRecord;
  }

  // ─── Client Method Delegates ──────────────────────────────────────────────

  get $queryRaw() {
    return this._client.$queryRaw.bind(this._client);
  }

  get $queryRawUnsafe() {
    return this._client.$queryRawUnsafe.bind(this._client);
  }

  get $executeRaw() {
    return this._client.$executeRaw.bind(this._client);
  }

  get $executeRawUnsafe() {
    return this._client.$executeRawUnsafe.bind(this._client);
  }

  get $transaction() {
    return this._client.$transaction.bind(this._client);
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  async cleanDatabase(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase is not allowed in production');
    }

    const tables = await this._client.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;

    for (const { tablename } of tables) {
      await this._client.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`);
    }
  }
}
