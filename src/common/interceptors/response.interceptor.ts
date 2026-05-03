import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, SuccessResponseBody } from '../responses/api.response';

/**
 * ResponseInterceptor — wraps raw controller return values in a success envelope.
 *
 * Responsibility: Ensures every successful response has a consistent shape:
 * { success, statusCode, message, data, timestamp, path }.
 * Registered globally via APP_INTERCEPTOR in AppModule.
 *
 * Flow:
 * 1. next.handle() — executes the route handler; emits the controller's return value.
 * 2. map() — checks if the value is already a structured SuccessResponseBody
 *    (identified by the presence of a `success` key). If so, pass through unchanged
 *    so controllers that build their own envelope are not double-wrapped.
 * 3. Otherwise, delegates to ApiResponse.buildSuccess() with the route's current
 *    statusCode and URL path.
 *
 * Note: Controllers in this project build their own envelopes (with custom messages),
 * so the pass-through branch handles the majority of cases. This interceptor is the
 * safety net for any handler that returns a plain value without an envelope.
 *
 * Used by: AppModule (APP_INTERCEPTOR provider)
 * See also: ApiResponse.buildSuccess() → src/common/responses/api.response.ts
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponseBody<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponseBody<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const statusCode = context.switchToHttp().getResponse().statusCode;

    return next.handle().pipe(
      map((data) => {
        // If the response is already a structured SuccessResponseBody, return as-is
        if (data && typeof data === 'object' && 'success' in data) {
          return data as unknown as SuccessResponseBody<T>;
        }

        return ApiResponse.buildSuccess('Operation successful', data, statusCode, request.url);
      }),
    );
  }
}
