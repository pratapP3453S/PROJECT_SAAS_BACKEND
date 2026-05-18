import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiError, ApiErrorPayload } from '../exceptions/api.error';
import { ApiResponse, ErrorResponseBody } from '../../shared/responses/api.response';

/**
 * AllExceptionsFilter — global last-resort exception handler.
 *
 * Responsibility: Catches every thrown value (errors, strings, anything) and
 * converts it to a standardized JSON error envelope before it reaches the client.
 * Registered globally via APP_FILTER in AppModule.
 *
 * Resolution priority (resolveException):
 *  1. ApiError            — our typed exception; payload is already structured.
 *  2. NestJS HttpException — generic NestJS/library exceptions; normalized into
 *     ApiErrorPayload (including class-validator arrays from ValidationPipe).
 *  3. Prisma errors       — identified by `code` starting with "P"; mapped to:
 *       P2002 → 409 Conflict (unique constraint)
 *       P2025 → 404 Not Found (record not found)
 *       P2003 → 400 Bad Request (foreign key constraint)
 *       else  → 500 DatabaseError
 *  4. Unknown/native Error — 500 InternalServerError; message included in
 *     `details` only in non-production environments.
 *
 * Logging behavior:
 *  - statusCode >= 500 → logger.error() with full stack trace
 *  - statusCode < 500  → logger.warn() with code only (avoids log spam)
 *
 * Output shape: { success: false, statusCode, error: ApiErrorPayload,
 *                 timestamp, path }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, errorPayload } = this.resolveException(exception);

    // Stack trace is included only outside production. Useful for the same
    // reasons we ship a `details` field in dev: the developer who hits an
    // error in their console wants to see exactly where it came from.
    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      errorPayload.stack = exception.stack;
    }

    const body: ErrorResponseBody = ApiResponse.attachDiagnostics({
      success: false,
      statusCode,
      error: errorPayload,
      timestamp: new Date().toISOString(),
      path: request.url,
    });

    // Log server errors. Include the requestId so the log line can be joined
    // with the response envelope's request.requestId field.
    const reqId = body.request?.requestId ?? '-';
    if (statusCode >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} -> ${statusCode} reqId=${reqId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} -> ${statusCode} ${errorPayload.code} reqId=${reqId}`,
      );
    }

    response.status(statusCode).json(body);
  }

  private resolveException(exception: unknown): {
    statusCode: number;
    errorPayload: ApiErrorPayload;
  } {
    // ─── ApiError (our custom typed error) ──────────────────────────────
    if (exception instanceof ApiError) {
      const response = exception.getResponse() as ApiErrorPayload;
      return {
        statusCode: exception.getStatus(),
        errorPayload: response,
      };
    }

    // ─── NestJS HttpException ────────────────────────────────────────────
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();

      // Handle class-validator errors piped through ValidationPipe
      if (typeof response === 'object' && response !== null) {
        const res = response as Record<string, unknown>;

        if (Array.isArray(res['message'])) {
          const fields = (res['message'] as string[]).map((msg) => {
            const parts = msg.split(' ');
            return {
              field: parts[0] || 'unknown',
              message: msg,
              constraint: res['error'] as string | undefined,
            };
          });

          return {
            statusCode,
            errorPayload: {
              name: 'ValidationError',
              code: 'ERR_VALIDATION_FAILED',
              message: 'The request contains invalid data.',
              details: `${fields.length} field(s) failed validation.`,
              fields,
            },
          };
        }

        return {
          statusCode,
          errorPayload: {
            name: String(res['error'] || 'HttpError'),
            code: `ERR_HTTP_${statusCode}`,
            message: String(res['message'] || exception.message),
          },
        };
      }

      return {
        statusCode,
        errorPayload: {
          name: 'HttpError',
          code: `ERR_HTTP_${statusCode}`,
          message: String(response),
        },
      };
    }

    // ─── Prisma Errors ───────────────────────────────────────────────────
    if (this.isPrismaError(exception)) {
      return this.handlePrismaError(exception as PrismaError);
    }

    // ─── Unknown / Native Errors ─────────────────────────────────────────
    const message =
      exception instanceof Error ? exception.message : 'An unexpected error occurred.';

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorPayload: {
        name: 'InternalServerError',
        code: 'ERR_INTERNAL_SERVER',
        message: 'An unexpected error occurred. Please try again later.',
        details: process.env.NODE_ENV !== 'production' ? message : undefined,
      },
    };
  }

  private isPrismaError(exception: unknown): boolean {
    return (
      exception !== null &&
      typeof exception === 'object' &&
      'code' in exception &&
      typeof (exception as Record<string, unknown>)['code'] === 'string' &&
      (exception as Record<string, unknown>)['code']!.toString().startsWith('P')
    );
  }

  private handlePrismaError(exception: PrismaError): {
    statusCode: number;
    errorPayload: ApiErrorPayload;
  } {
    switch (exception.code) {
      case 'P2002': {
        const fields = exception.meta?.target as string[] | undefined;
        return {
          statusCode: HttpStatus.CONFLICT,
          errorPayload: {
            name: 'ConflictError',
            code: 'ERR_UNIQUE_CONSTRAINT',
            message: `A record with this ${fields?.join(', ') || 'value'} already exists.`,
            details: exception.message,
          },
        };
      }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          errorPayload: {
            name: 'NotFoundError',
            code: 'ERR_RECORD_NOT_FOUND',
            message: 'The requested record was not found.',
            details: exception.message,
          },
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          errorPayload: {
            name: 'ForeignKeyError',
            code: 'ERR_FOREIGN_KEY_CONSTRAINT',
            message: 'Related record not found.',
            details: exception.message,
          },
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          errorPayload: {
            name: 'DatabaseError',
            code: 'ERR_DATABASE',
            message: 'A database error occurred.',
            details: process.env.NODE_ENV !== 'production' ? exception.message : undefined,
          },
        };
    }
  }
}

interface PrismaError {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}
