import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * LoggerMiddleware — Express-layer HTTP access logger.
 *
 * Responsibility: Logs one line per request at the Express middleware level,
 * before NestJS guards or interceptors execute. Applied to all routes via
 * AppModule.configure().
 *
 * Flow:
 * 1. Capture method, originalUrl, ip, user-agent, and startTime on request.
 * 2. Attach a listener to res 'finish' event (fires after headers are flushed).
 * 3. On finish: compute duration, read statusCode and content-length, log line.
 * 4. Call next() immediately so the request continues through the pipeline.
 *
 * Log format: "METHOD /path STATUS DURATIONms BYTES - IP "user-agent""
 *
 * Note: This runs at the Express layer (before NestJS). LoggingInterceptor runs
 * inside the NestJS pipeline and logs the NestJS-resolved status code. Both are
 * complementary — this one is great for raw HTTP visibility.
 *
 * Used by: AppModule → consumer.apply(LoggerMiddleware, SanitizeMiddleware)
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '-';
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const contentLength = res.get('content-length');
      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${duration}ms ${contentLength ?? '-'} - ${ip} "${userAgent}"`,
      );
    });

    next();
  }
}
