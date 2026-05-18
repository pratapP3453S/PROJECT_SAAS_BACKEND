/**
 * APP_CONSTANTS — numeric and regex application-wide constants.
 *
 * DEFAULT_PAGE / DEFAULT_LIMIT / MAX_LIMIT : pagination defaults (used in PaginationDto).
 * MIN/MAX_PASSWORD_LENGTH                  : enforced by RegisterDto via class-validator.
 * BCRYPT_ROUNDS                            : cost factor for bcrypt password hashing (10 = ~100ms).
 * UUID_REGEX / EMAIL_REGEX / PHONE_REGEX   : shared validation patterns for DTOs and guards.
 */
export const APP_CONSTANTS = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  BCRYPT_ROUNDS: 10,
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^\+?[1-9]\d{1,14}$/,
} as const;

/**
 * CACHE_KEYS — factory functions for Redis cache key strings.
 *
 * Using functions (not plain strings) prevents key collisions and makes
 * cache invalidation explicit — callers must always pass the identifying value.
 *
 * USER(id)            : full user profile cached by UserService.findById()
 * USER_BY_EMAIL(email): email → user lookup cached by auth flows
 * REFRESH_TOKEN(id)   : refresh token hash cache (currently unused; reserved)
 */
export const CACHE_KEYS = {
  USER: (id: string) => `user:${id}`,
  USER_BY_EMAIL: (email: string) => `user:email:${email}`,
  REFRESH_TOKEN: (userId: string) => `refresh_token:${userId}`,
} as const;

/**
 * QUEUE_NAMES — BullMQ queue name constants.
 * Used by @InjectQueue(QUEUE_NAMES.X) in producer services and
 * @Processor(QUEUE_NAMES.X) in processor classes.
 * Register new queue names here first, then add to JobsModule.
 */
export const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  UPLOAD: 'upload-queue',
  NOTIFICATION: 'notification-queue',
} as const;

/**
 * JOB_NAMES — BullMQ job type name constants.
 * Passed as the first argument to queue.add(JOB_NAMES.X, data) in producers
 * and matched by @Process(JOB_NAMES.X) in processors.
 */
export const JOB_NAMES = {
  SEND_EMAIL: 'send-email',
  PROCESS_UPLOAD: 'process-upload',
  SEND_NOTIFICATION: 'send-notification',
} as const;

/**
 * Metadata keys used by NestJS Reflector to read decorator metadata in guards.
 *
 * ROLES_KEY        : set by @Roles(), read by RolesGuard
 * IS_PUBLIC_KEY    : set by @Public(), read by JwtAuthGuard
 * CURRENT_USER_KEY : reserved for @CurrentUser() param decorator context
 */
export const ROLES_KEY = 'roles';
export const IS_PUBLIC_KEY = 'isPublic';
export const CURRENT_USER_KEY = 'currentUser';
