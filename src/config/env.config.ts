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

  // ─── Uploads ────────────────────────────────────────────────────────────
  @IsNumber()
  @IsOptional()
  MAX_FILE_SIZE_MB: number = 10;

  @IsString()
  @IsOptional()
  UPLOAD_DEST: string = './uploads';

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
