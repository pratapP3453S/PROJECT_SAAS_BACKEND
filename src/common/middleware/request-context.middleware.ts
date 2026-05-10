import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RequestContext } from '../context/request-context';

/**
 * RequestContextMiddleware — opens a per-request AsyncLocalStorage scope so
 * downstream code (PrismaService, CacheService, ResponseInterceptor,
 * AllExceptionsFilter) can read and mutate the same RequestContextData.
 *
 * Wiring requirements
 *  - MUST be applied BEFORE any other middleware/guard/interceptor that wants
 *    to inspect the context. In AppModule.configure(), apply this first.
 *  - Honours an inbound `X-Request-Id` header for distributed tracing — if the
 *    caller (an upstream gateway, another service) has already assigned an id
 *    we adopt it; otherwise we mint a uuid.
 *
 * Side-effects
 *  - Sets `X-Request-Id` on the response so clients/log aggregators can
 *    correlate without parsing the JSON body.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inboundId = (req.headers['x-request-id'] as string | undefined)?.trim();

    RequestContext.run(
      {
        requestId: inboundId || undefined, // RequestContext.run mints one when omitted
        method: req.method,
        path: req.originalUrl || req.url,
        apiVersion: this.extractApiVersion(req.originalUrl || req.url),
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      () => {
        const ctx = RequestContext.current();
        if (ctx) {
          // Echo on the response so tracing tools can correlate without
          // unmarshalling the JSON body.
          res.setHeader('X-Request-Id', ctx.requestId);
        }
        next();
      },
    );
  }

  /** Extract "v1" from "/api/v1/users". Returns undefined when not present. */
  private extractApiVersion(url: string): string | undefined {
    const m = url.match(/\/api\/(v\d+)(\/|$)/);
    return m ? m[1] : undefined;
  }
}
