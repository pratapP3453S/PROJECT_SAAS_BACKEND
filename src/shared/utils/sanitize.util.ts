import xss from 'xss';

/**
 * sanitize.util — XSS sanitization and sensitive-field stripping utilities.
 *
 * Responsibility: Pure utility functions used by SanitizeMiddleware and UserService.
 * No state, no DI — safe to call from any context.
 *
 * Functions:
 *  sanitizeString(input)            : Trim + xss() the input string.
 *  sanitizeObject<T>(obj)           : Recursively sanitize all string values in an object.
 *  sanitizeValue(value)             : Internal recursive helper — handles string,
 *                                     array, object, and primitive branches.
 *  stripSensitiveFields<T>(obj, fields?): Shallow-copy an object and delete the listed
 *    fields. Defaults: ['password', 'refreshToken', 'passwordResetToken'].
 *    Called by UserService.toPublicProfile() to strip the User model before
 *    returning it to the client.
 *
 * Library: `xss` (pnpm) — whitelist-based HTML sanitizer; strips tags and attributes
 * that are not explicitly allowed.
 *
 * Used by:
 *  SanitizeMiddleware : src/common/middleware/sanitize.middleware.ts (req body/query/params)
 *  UserService        : src/modules/user/user.service.ts (toPublicProfile)
 */

export function sanitizeString(input: string): string {
  return xss(input.trim());
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, sanitizeValue(value)]),
  ) as T;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === 'object')
    return sanitizeObject(value as Record<string, unknown>);
  return value;
}

export function stripSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[] = ['password', 'refreshToken', 'passwordResetToken'],
): Omit<T, string> {
  const result = { ...obj };
  for (const field of fields) {
    delete result[field];
  }
  return result;
}
