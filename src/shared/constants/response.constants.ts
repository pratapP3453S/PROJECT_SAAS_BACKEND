/**
 * ResponseDefinition — contract for all entries in the Responses registry.
 * Mirrors ErrorDefinition: each entry centralizes the HTTP status code and
 * human-readable message for a given success scenario.
 */
export interface ResponseDefinition {
  message: string;
  statusCode: number;
}

/**
 * Responses — centralized registry of every typed application success response.
 *
 * Responsibility: Single source of truth for success messages and HTTP status
 * codes. All ApiResponse.fromDefinition() calls reference entries from this object.
 *
 * Grouped by domain:
 *  Generic  : common CRUD outcomes
 *  Auth     : register, login, token, logout
 *  User     : user CRUD-level responses
 *  Upload   : file handling responses
 *  Health   : liveness/readiness checks
 *
 * `as const satisfies Record<string, ResponseDefinition>` provides:
 *  - Literal narrowing of message strings (for exhaustive checks)
 *  - Compile-time enforcement that every entry matches ResponseDefinition
 *
 * Used by: ApiResponse (src/shared/responses/api.response.ts)
 */
export const Responses = {
  // ─── Generic ────────────────────────────────────────────────────────────
  OK: {
    message: 'Request completed successfully.',
    statusCode: 200,
  },
  CREATED: {
    message: 'Resource created successfully.',
    statusCode: 201,
  },
  DELETED: {
    message: 'Resource deleted successfully.',
    statusCode: 200,
  },

  // ─── Auth ───────────────────────────────────────────────────────────────
  REGISTER_SUCCESS: {
    message: 'Registration successful. Welcome!',
    statusCode: 201,
  },
  LOGIN_SUCCESS: {
    message: 'Login successful.',
    statusCode: 200,
  },
  TOKEN_REFRESHED: {
    message: 'Token refreshed successfully.',
    statusCode: 200,
  },
  LOGOUT_SUCCESS: {
    message: 'Logged out successfully.',
    statusCode: 200,
  },

  // ─── User ───────────────────────────────────────────────────────────────
  USER_FETCHED: {
    message: 'User retrieved successfully.',
    statusCode: 200,
  },
  USERS_FETCHED: {
    message: 'Users retrieved successfully.',
    statusCode: 200,
  },
  PROFILE_FETCHED: {
    message: 'Profile retrieved successfully.',
    statusCode: 200,
  },
  PROFILE_UPDATED: {
    message: 'Profile updated successfully.',
    statusCode: 200,
  },
  USER_UPDATED: {
    message: 'User updated successfully.',
    statusCode: 200,
  },
  USER_DELETED: {
    message: 'User deleted successfully.',
    statusCode: 200,
  },

  // ─── Upload ─────────────────────────────────────────────────────────────
  FILE_UPLOADED: {
    message: 'File uploaded successfully. Use POST /upload/commit to promote to permanent storage.',
    statusCode: 201,
  },
  FILE_COMMITTED: {
    message: 'File committed to permanent storage.',
    statusCode: 200,
  },
  FILE_DELETED: {
    message: 'File deleted successfully.',
    statusCode: 200,
  },

  // ─── Health ─────────────────────────────────────────────────────────────
  HEALTH_OK: {
    message: 'pong',
    statusCode: 200,
  },
} as const satisfies Record<string, ResponseDefinition>;

export type ResponseKey = keyof typeof Responses;
