import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * validateEnv — ConfigModule environment validation function.
 *
 * Responsibility: Called by ConfigModule.forRoot({ validate }) at application
 * startup. Transforms the raw process.env object into a typed
 * EnvironmentVariables instance and runs class-validator on it. Throws at boot
 * time (not at runtime) if any required variable is missing or invalid.
 *
 * EnvironmentVariables class:
 *  - Groups variables by domain (App, Database, JWT, Redis, BullMQ, etc.).
 *  - Required fields have no default (DATABASE_URL, JWT_SECRET, etc.) — app
 *    will refuse to start if these are absent.
 *  - Optional fields carry defaults so the app can run without a full .env.
 *  - enableImplicitConversion:true lets class-transformer coerce PORT (string)
 *    to number, SWAGGER_ENABLED (string) to boolean, etc.
 *
 * Used by: AppModule → ConfigModule.forRoot({ validate: validateEnv })
 * See also: .env.example for all supported variable names and descriptions.
 */
enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

class EnvironmentVariables {
  // ─── App ────────────────────────────────────────────────────────────────
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  APP_NAME: string = 'NestJS Enterprise API';

  @IsString()
  APP_VERSION: string = '1.0.0';

  @IsString()
  API_PREFIX: string = 'api/v1';

  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = 'http://localhost:3000';

  // ─── Database ───────────────────────────────────────────────────────────
  @IsString()
  DATABASE_URL: string;

  // ─── JWT ────────────────────────────────────────────────────────────────
  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string = '7d';

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string = '30d';

  // ─── Redis ──────────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD: string = '';

  @IsNumber()
  @IsOptional()
  REDIS_DB: number = 0;

  @IsNumber()
  @IsOptional()
  REDIS_TTL: number = 3600;

  // ─── Encryption ─────────────────────────────────────────────────────────
  @IsString()
  IMAGE_ENCRYPTION_KEY: string;

  // ─── Rate Limiting ──────────────────────────────────────────────────────
  @IsNumber()
  @IsOptional()
  THROTTLE_TTL: number = 60;

  @IsNumber()
  @IsOptional()
  THROTTLE_LIMIT: number = 100;

  // ─── Uploads — core ─────────────────────────────────────────────────────
  // Cross-provider switches. Provider-specific keys (AWS_*, CF_*, CLOUDINARY_*,
  // IMAGEKIT_*) are validated lazily inside UploadConfigService when the matching
  // provider is selected, so a developer can omit S3 keys while running locally.
  @IsString()
  @IsOptional()
  UPLOAD_PROVIDER: string = 'local';

  @IsNumber()
  @IsOptional()
  MAX_FILE_SIZE_MB: number = 10;

  @IsString()
  @IsOptional()
  UPLOAD_DEST: string = './uploads';

  @IsNumber()
  @IsOptional()
  UPLOAD_TEMP_RETENTION_HOURS: number = 24;

  @IsNumber()
  @IsOptional()
  UPLOAD_PRESIGNED_EXPIRY: number = 3600;

  @IsBoolean()
  @IsOptional()
  UPLOAD_ENABLE_PRESIGNED_URLS: boolean = true;

  @IsBoolean()
  @IsOptional()
  UPLOAD_ENABLE_ENCRYPTION: boolean = true;

  @IsBoolean()
  @IsOptional()
  UPLOAD_ENABLE_AUDIT: boolean = true;

  @IsString()
  @IsOptional()
  UPLOAD_AUDIT_DESTINATION: string = 'database';

  @IsNumber()
  @IsOptional()
  UPLOAD_MAX_CONCURRENT: number = 5;

  @IsNumber()
  @IsOptional()
  UPLOAD_MAX_RETRIES: number = 3;

  @IsNumber()
  @IsOptional()
  UPLOAD_RETRY_DELAY_MS: number = 1000;

  @IsString()
  @IsOptional()
  UPLOAD_PUBLIC_BASE_URL: string = '';

  // ─── Uploads — S3 ───────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  AWS_REGION: string = 'us-east-1';

  @IsString()
  @IsOptional()
  AWS_S3_BUCKET: string = '';

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY_ID: string = '';

  @IsString()
  @IsOptional()
  AWS_SECRET_ACCESS_KEY: string = '';

  @IsString()
  @IsOptional()
  AWS_S3_ENDPOINT: string = '';

  @IsBoolean()
  @IsOptional()
  AWS_S3_FORCE_PATH_STYLE: boolean = false;

  @IsString()
  @IsOptional()
  AWS_S3_PUBLIC_URL: string = '';

  @IsNumber()
  @IsOptional()
  AWS_S3_MAX_RETRIES: number = 3;

  @IsString()
  @IsOptional()
  AWS_S3_TEMP_PREFIX: string = 'uploads/temp';

  @IsString()
  @IsOptional()
  AWS_S3_PERMANENT_PREFIX: string = 'uploads';

  // ─── Uploads — Cloudflare R2 ────────────────────────────────────────────
  @IsString() @IsOptional() CF_ACCOUNT_ID: string = '';
  @IsString() @IsOptional() CF_ACCESS_KEY_ID: string = '';
  @IsString() @IsOptional() CF_SECRET_ACCESS_KEY: string = '';
  @IsString() @IsOptional() CF_BUCKET_NAME: string = '';
  @IsString() @IsOptional() CF_ENDPOINT: string = '';
  @IsString() @IsOptional() CF_PUBLIC_URL: string = '';
  @IsString() @IsOptional() CF_TEMP_PREFIX: string = 'uploads/temp';
  @IsString() @IsOptional() CF_PERMANENT_PREFIX: string = 'uploads';

  // ─── Uploads — Cloudinary ───────────────────────────────────────────────
  @IsString() @IsOptional() CLOUDINARY_URL: string = '';
  @IsString() @IsOptional() CLOUDINARY_CLOUD_NAME: string = '';
  @IsString() @IsOptional() CLOUDINARY_API_KEY: string = '';
  @IsString() @IsOptional() CLOUDINARY_API_SECRET: string = '';
  @IsString() @IsOptional() CLOUDINARY_FOLDER: string = 'uploads';
  @IsString() @IsOptional() CLOUDINARY_UPLOAD_PRESET: string = '';
  @IsBoolean() @IsOptional() CLOUDINARY_USE_SIGNED: boolean = true;
  @IsBoolean() @IsOptional() CLOUDINARY_SECURE: boolean = true;

  // ─── Uploads — ImageKit ─────────────────────────────────────────────────
  @IsString() @IsOptional() IMAGEKIT_PUBLIC_KEY: string = '';
  @IsString() @IsOptional() IMAGEKIT_PRIVATE_KEY: string = '';
  @IsString() @IsOptional() IMAGEKIT_URL_ENDPOINT: string = '';
  @IsString() @IsOptional() IMAGEKIT_FOLDER: string = 'uploads';
  @IsBoolean() @IsOptional() IMAGEKIT_USE_UNIQUE_FILENAME: boolean = true;

  // ─── Swagger ────────────────────────────────────────────────────────────
  @IsBoolean()
  @IsOptional()
  SWAGGER_ENABLED: boolean = true;

  @IsString()
  @IsOptional()
  SWAGGER_PATH: string = 'docs';

  // ─── Logging ────────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'debug';

  @IsString()
  @IsOptional()
  LOG_DIR: string = './logs';
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }

  return validatedConfig;
}

export type EnvConfig = EnvironmentVariables;
