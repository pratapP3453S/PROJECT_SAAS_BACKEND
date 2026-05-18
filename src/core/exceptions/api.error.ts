import { HttpException } from '@nestjs/common';
import { ErrorDefinition, Errors } from '../../shared/constants/error.constants';

/**
 * FieldError — describes a single field-level validation failure.
 * Attached to ApiErrorPayload.fields[] so clients can pinpoint bad inputs.
 *
 * field      : dot-notated field name (e.g. "address.zip")
 * message    : human-readable constraint message
 * value      : the rejected value (omit in production if it may be sensitive)
 * constraint : class-validator constraint key (e.g. "isEmail", "minLength")
 */

export interface FieldError {
  field: string;
  message: string;
  value?: unknown;
  constraint?: string;
}

export interface ApiErrorPayload {
  name: string;
  code: string;
  message: string;
  details?: string;
  fields?: FieldError[];
  /**
   * Stack trace for the originating exception. Populated by AllExceptionsFilter
   * outside production. Never sent in prod responses to avoid leaking internals.
   */
  stack?: string;
}

/**
 * ApiErrorResponse — the top-level error envelope written to the HTTP response.
 * Produced by AllExceptionsFilter and returned as JSON to the client.
 */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: ApiErrorPayload;
  timestamp: string;
  path?: string;
}

/**
 * ApiError — the single typed error class for all application exceptions.
 *
 * Responsibility: Extends NestJS HttpException so it integrates with
 * AllExceptionsFilter and NestJS's built-in exception handling. Carries a
 * machine-readable `code` and optional `fields` array for validation errors.
 *
 * Usage patterns:
 *  1. Predefined shortcuts — ApiError.userNotFound(), .invalidCredentials(), etc.
 *     These use Errors constants so codes and messages stay centralized.
 *  2. Generic factories — ApiError.notFound(msg), .badRequest(msg), etc.
 *     Use when the exact error isn't in Errors but the HTTP status category is.
 *  3. fromDefinition(ErrorDefinition) — constructs from an Errors constant
 *     with optional runtime details/fields appended.
 *  4. Direct constructor — for one-off errors with fully custom payload.
 *
 * Caught by: AllExceptionsFilter → src/core/filters/all-exceptions.filter.ts
 */
export class ApiError extends HttpException {
  public readonly code: string;
  public readonly name: string;
  public readonly details?: string;
  public readonly fields?: FieldError[];

  constructor(
    message: string,
    statusCode: number,
    options: {
      code?: string;
      name?: string;
      details?: string;
      fields?: FieldError[];
    } = {},
  ) {
    const { code = 'ERR_UNKNOWN', name = 'ApiError', details, fields } = options;

    const errorPayload: ApiErrorPayload = { name, code, message, details, fields };
    super(errorPayload, statusCode);

    this.name = name;
    this.code = code;
    this.details = details;
    this.fields = fields;
  }

  // ─── Factory: From Error Definition ─────────────────────────────────────
  static fromDefinition(
    definition: ErrorDefinition,
    options: { details?: string; fields?: FieldError[] } = {},
  ): ApiError {
    return new ApiError(definition.message, definition.statusCode, {
      code: definition.code,
      name: definition.name,
      details: options.details,
      fields: options.fields,
    });
  }

  // ─── Factory: Common Shortcuts ───────────────────────────────────────────
  static badRequest(message: string, code = 'ERR_BAD_REQUEST', details?: string): ApiError {
    return new ApiError(message, 400, { code, name: 'BadRequestError', details });
  }

  static unauthorized(message: string, code = 'ERR_UNAUTHORIZED', details?: string): ApiError {
    return new ApiError(message, 401, { code, name: 'UnauthorizedError', details });
  }

  static forbidden(message: string, code = 'ERR_FORBIDDEN', details?: string): ApiError {
    return new ApiError(message, 403, { code, name: 'ForbiddenError', details });
  }

  static notFound(message: string, code = 'ERR_NOT_FOUND', details?: string): ApiError {
    return new ApiError(message, 404, { code, name: 'NotFoundError', details });
  }

  static conflict(message: string, code = 'ERR_CONFLICT', details?: string): ApiError {
    return new ApiError(message, 409, { code, name: 'ConflictError', details });
  }

  static unprocessable(
    message: string,
    code = 'ERR_UNPROCESSABLE',
    fields?: FieldError[],
  ): ApiError {
    return new ApiError(message, 422, { code, name: 'UnprocessableEntityError', fields });
  }

  static internal(message: string, code = 'ERR_INTERNAL_SERVER'): ApiError {
    return new ApiError(message, 500, { code, name: 'InternalServerError' });
  }

  static validation(message: string, fields: FieldError[]): ApiError {
    return new ApiError(message, 422, {
      code: 'ERR_VALIDATION_FAILED',
      name: 'ValidationError',
      fields,
    });
  }

  // ─── Predefined Shortcuts ────────────────────────────────────────────────
  static userNotFound(): ApiError {
    return ApiError.fromDefinition(Errors.USER_NOT_FOUND);
  }

  static invalidCredentials(): ApiError {
    return ApiError.fromDefinition(Errors.INVALID_CREDENTIALS);
  }

  static emailAlreadyExists(): ApiError {
    return ApiError.fromDefinition(Errors.EMAIL_ALREADY_EXISTS);
  }

  static tokenExpired(): ApiError {
    return ApiError.fromDefinition(Errors.TOKEN_EXPIRED);
  }

  static tokenInvalid(): ApiError {
    return ApiError.fromDefinition(Errors.TOKEN_INVALID);
  }
}
