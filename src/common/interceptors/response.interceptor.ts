import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, SuccessResponseBody } from '../responses/api.response';

/**
 * ResponseInterceptor — wraps controller return values in the standard envelope
 * AND stamps diagnostics (`request`, `timing`, `server`, `tags`) onto every
 * response by reading the active RequestContext.
 *
 * Behaviour
 *  - If the controller already returned a structured envelope (object with
 *    `success: true`), we don't re-wrap — but we still attach diagnostics if
 *    they're missing. That way controllers using ApiResponse.fromDefinition()
 *    get the rich meta for free.
 *  - If the controller returned a plain value, we wrap with buildSuccess and
 *    then attach diagnostics.
 *
 * Why attach diagnostics here and not in ApiResponse.fromDefinition?
 *  fromDefinition runs synchronously inside the controller — that's BEFORE the
 *  request finishes, so timing.totalMs would be wrong. The interceptor is the
 *  last hop before the response is serialised, so it gets the true latency.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponseBody<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponseBody<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const statusCode = context.switchToHttp().getResponse().statusCode;

    return next.handle().pipe(
      map((data) => {
        // Already a structured envelope — only attach diagnostics, don't rewrap.
        if (data && typeof data === 'object' && 'success' in data) {
          return ApiResponse.attachDiagnostics(
            data as unknown as SuccessResponseBody<T>,
          );
        }

        const body = ApiResponse.buildSuccess(
          'Operation successful',
          data,
          statusCode,
          request.url,
        );
        return ApiResponse.attachDiagnostics(body);
      }),
    );
  }
}
