/**
 * ErrorDefinition — contract for all entries in the Errors registry.
 * Each definition produces a machine-readable code, human-readable message,
 * HTTP status, and an error name for the JSON response envelope.
 */
export interface ErrorDefinition {
  code: string;
  message: string;
  statusCode: number;
  name: string;
}

/**
 * Errors — centralized registry of every typed application error.
 *
 * Responsibility: Single source of truth for error codes, messages, and HTTP
 * status codes. All ApiError factory shortcuts (e.g. ApiError.userNotFound())
 * and ApiError.fromDefinition() calls reference entries from this object.
 *
 * Grouped by domain:
 *  Generic   : 400, 401, 403, 404, 409, 422, 429, 500
 *  Auth      : credential failures, token errors, account status
 *  User      : user CRUD-level errors
 *  Upload    : file handling errors
 *
 * `as const satisfies Record<string, ErrorDefinition>` provides:
 *  - Literal narrowing of code/name strings (for exhaustive checks)
 *  - Compile-time enforcement that every entry matches ErrorDefinition
 *
 * Used by: ApiError (src/core/exceptions/api.error.ts)
 */
export const Errors = {
  // ─── Generic ────────────────────────────────────────────────────────────
  INTERNAL_SERVER_ERROR: {
    code: 'ERR_INTERNAL_SERVER',
    message: 'An unexpected error occurred. Please try again later.',
    statusCode: 500,
    name: 'InternalServerError',
  },
  BAD_REQUEST: {
    code: 'ERR_BAD_REQUEST',
    message: 'The request is invalid or malformed.',
    statusCode: 400,
    name: 'BadRequestError',
  },
  VALIDATION_FAILED: {
    code: 'ERR_VALIDATION_FAILED',
    message: 'The request contains invalid data.',
    statusCode: 422,
    name: 'ValidationError',
  },
  NOT_FOUND: {
    code: 'ERR_NOT_FOUND',
    message: 'The requested resource was not found.',
    statusCode: 404,
    name: 'NotFoundError',
  },
  UNAUTHORIZED: {
    code: 'ERR_UNAUTHORIZED',
    message: 'Authentication is required to access this resource.',
    statusCode: 401,
    name: 'UnauthorizedError',
  },
  FORBIDDEN: {
    code: 'ERR_FORBIDDEN',
    message: 'You do not have permission to access this resource.',
    statusCode: 403,
    name: 'ForbiddenError',
  },
  CONFLICT: {
    code: 'ERR_CONFLICT',
    message: 'The request conflicts with the current state of the resource.',
    statusCode: 409,
    name: 'ConflictError',
  },
  TOO_MANY_REQUESTS: {
    code: 'ERR_TOO_MANY_REQUESTS',
    message: 'Too many requests. Please slow down.',
    statusCode: 429,
    name: 'TooManyRequestsError',
  },

  // ─── Auth ───────────────────────────────────────────────────────────────
  INVALID_CREDENTIALS: {
    code: 'ERR_INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
    statusCode: 401,
    name: 'InvalidCredentialsError',
  },
  TOKEN_EXPIRED: {
    code: 'ERR_TOKEN_EXPIRED',
    message: 'Your session has expired. Please log in again.',
    statusCode: 401,
    name: 'TokenExpiredError',
  },
  TOKEN_INVALID: {
    code: 'ERR_TOKEN_INVALID',
    message: 'The provided token is invalid.',
    statusCode: 401,
    name: 'TokenInvalidError',
  },
  REFRESH_TOKEN_INVALID: {
    code: 'ERR_REFRESH_TOKEN_INVALID',
    message: 'Refresh token is invalid or has expired.',
    statusCode: 401,
    name: 'RefreshTokenInvalidError',
  },
  EMAIL_NOT_VERIFIED: {
    code: 'ERR_EMAIL_NOT_VERIFIED',
    message: 'Please verify your email address before logging in.',
    statusCode: 403,
    name: 'EmailNotVerifiedError',
  },
  ACCOUNT_SUSPENDED: {
    code: 'ERR_ACCOUNT_SUSPENDED',
    message: 'Your account has been suspended. Please contact support.',
    statusCode: 403,
    name: 'AccountSuspendedError',
  },
  ACCOUNT_INACTIVE: {
    code: 'ERR_ACCOUNT_INACTIVE',
    message: 'Your account is inactive.',
    statusCode: 403,
    name: 'AccountInactiveError',
  },

  // ─── User ───────────────────────────────────────────────────────────────
  USER_NOT_FOUND: {
    code: 'ERR_USER_NOT_FOUND',
    message: 'User not found.',
    statusCode: 404,
    name: 'UserNotFoundError',
  },
  EMAIL_ALREADY_EXISTS: {
    code: 'ERR_EMAIL_ALREADY_EXISTS',
    message: 'An account with this email already exists.',
    statusCode: 409,
    name: 'EmailAlreadyExistsError',
  },
  INVALID_PASSWORD: {
    code: 'ERR_INVALID_PASSWORD',
    message: 'Current password is incorrect.',
    statusCode: 400,
    name: 'InvalidPasswordError',
  },

  // ─── Upload ─────────────────────────────────────────────────────────────
  FILE_NOT_UPLOADED: {
    code: 'ERR_FILE_NOT_UPLOADED',
    message: 'No file was provided in the request.',
    statusCode: 400,
    name: 'FileNotUploadedError',
  },
  FILE_URL_REQUIRED: {
    code: 'ERR_FILE_URL_REQUIRED',
    message: 'File URL is required.',
    statusCode: 400,
    name: 'FileUrlRequiredError',
  },
  FILE_NOT_FOUND: {
    code: 'ERR_FILE_NOT_FOUND',
    message: 'File not found or already deleted.',
    statusCode: 404,
    name: 'FileNotFoundError',
  },
  FILE_TOO_LARGE: {
    code: 'ERR_FILE_TOO_LARGE',
    message: 'File size exceeds the maximum allowed limit.',
    statusCode: 413,
    name: 'FileTooLargeError',
  },
  INVALID_FILE_TYPE: {
    code: 'ERR_INVALID_FILE_TYPE',
    message: 'The uploaded file type is not allowed.',
    statusCode: 415,
    name: 'InvalidFileTypeError',
  },

  // ─── Idempotency ────────────────────────────────────────────────────────
  DUPLICATE_REQUEST: {
    code: 'ERR_DUPLICATE_REQUEST',
    message: 'A duplicate request was detected. Please wait before retrying.',
    statusCode: 409,
    name: 'DuplicateRequestError',
  },
  IDEMPOTENCY_KEY_MISMATCH: {
    code: 'ERR_IDEMPOTENCY_KEY_MISMATCH',
    message: 'This Idempotency-Key was already used with a different request payload.',
    statusCode: 422,
    name: 'IdempotencyKeyMismatchError',
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorKey = keyof typeof Errors;
