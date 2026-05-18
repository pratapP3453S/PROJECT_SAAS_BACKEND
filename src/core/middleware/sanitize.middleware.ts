import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import xss from 'xss';

/**
 * SanitizeMiddleware — XSS input sanitization middleware.
 *
 * Responsibility: Strips HTML/script tags from all incoming user-controlled
 * strings before they reach controllers or validation pipes. Applied to all
 * routes via AppModule.configure() alongside LoggerMiddleware.
 *
 * Flow:
 * 1. Recursively sanitize req.body   — JSON request payloads.
 * 2. Recursively sanitize req.query  — URL query parameters.
 * 3. Recursively sanitize req.params — path parameters.
 * 4. Call next() to continue the pipeline.
 *
 * sanitize() algorithm (recursive, type-safe):
 *  - string  → xss(value.trim())        strip HTML tags and attributes
 *  - array   → map each element          recurse into arrays
 *  - object  → map each value            recurse into nested objects
 *  - other   → return as-is             numbers, booleans, null untouched
 *
 * Library: `xss` (pnpm) — whitelist-based HTML sanitizer.
 * Used by: AppModule → consumer.apply(LoggerMiddleware, SanitizeMiddleware)
 */
@Injectable()
export class SanitizeMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.body) {
      req.body = this.sanitize(req.body);
    }
    if (req.query) {
      req.query = this.sanitize(req.query) as Record<string, string | string[]>;
    }
    if (req.params) {
      req.params = this.sanitize(req.params) as Record<string, string>;
    }
    next();
  }

  private sanitize<T>(data: T): T {
    if (typeof data === 'string') {
      return xss(data.trim()) as unknown as T;
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item)) as unknown as T;
    }
    if (data !== null && typeof data === 'object') {
      return Object.fromEntries(
        Object.entries(data as Record<string, unknown>).map(([key, value]) => [
          key,
          this.sanitize(value),
        ]),
      ) as T;
    }
    return data;
  }
}
