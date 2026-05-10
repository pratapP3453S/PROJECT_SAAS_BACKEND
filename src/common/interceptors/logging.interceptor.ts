import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RequestContext } from '../context/request-context';

/**
 * LoggingInterceptor — per-request HTTP access logger.
 *
 * Responsibility: Records method, URL, status code, duration, client IP, and
 * user-agent for every request that passes through the NestJS pipeline.
 * Registered globally via APP_INTERCEPTOR in AppModule.
 *
 * Flow:
 * 1. Capture method, url, ip, user-agent and start timestamp before forwarding.
 * 2. next.handle() — executes the route handler.
 * 3. tap({ next }) — fires after a successful response; reads final statusCode
 *    from the response object and logs at INFO level.
 * 4. tap({ error }) — fires when the handler throws; logs at WARN level with
 *    the error message (the error itself propagates to AllExceptionsFilter).
 *
 * Note: Works alongside LoggerMiddleware. The middleware logs at the Express
 * layer (before NestJS guards/interceptors); this interceptor logs inside the
 * NestJS pipeline with the resolved NestJS status code.
 *
 * Used by: AppModule (APP_INTERCEPTOR provider)
 * See also: LoggerMiddleware → src/common/middleware/logger.middleware.ts
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] || '-';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;
          const duration = Date.now() - startTime;
          this.logger.log(
            `${method} ${url} ${statusCode} ${duration}ms ${this.timingTail()} - ${ip} "${userAgent}"`,
          );
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;
          this.logger.warn(
            `${method} ${url} ERROR ${duration}ms ${this.timingTail()} - ${ip} "${userAgent}" - ${error.message}`,
          );
        },
      }),
    );
  }

  /**
   * Compose the diagnostic tail of the access-log line:
   *   "reqId=xxxxx db=5/12.4ms cache=2/0.8ms (1H/1M)"
   * Reads from the active RequestContext — silently empty when no request scope.
   */
  private timingTail(): string {
    const ctx = RequestContext.current();
    if (!ctx) return '';
    const parts = [`reqId=${ctx.requestId.slice(0, 8)}`];
    if (ctx.dbQueries > 0) {
      parts.push(`db=${ctx.dbQueries}/${ctx.dbTimeMs.toFixed(1)}ms`);
    }
    if (ctx.cacheOps > 0) {
      parts.push(
        `cache=${ctx.cacheOps}/${ctx.cacheTimeMs.toFixed(1)}ms (${ctx.cacheHits}H/${ctx.cacheMisses}M)`,
      );
    }
    if (ctx.externalCalls > 0) {
      parts.push(`ext=${ctx.externalCalls}/${ctx.externalTimeMs.toFixed(1)}ms`);
    }
    return parts.join(' ');
  }
}
