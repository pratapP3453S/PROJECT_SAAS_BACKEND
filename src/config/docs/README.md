# Config Layer Developer Guide

## Purpose

`src/config` owns typed runtime configuration, environment validation, and Swagger setup. Configuration values should be read through `ConfigService` and registered namespaces rather than ad hoc `process.env` access in business code.

## Startup Flow

1. `AppModule` imports `ConfigModule.forRoot()`.
2. `validateEnv()` converts raw environment values into `EnvironmentVariables`.
3. `class-validator` rejects missing or invalid required values at boot.
4. Config namespaces are loaded:
   - `appConfig`
   - `databaseConfig`
   - `jwtConfig`
   - `redisConfig`
5. Services inject `ConfigService` to read typed values.

## Key Files

- `env.config.ts`: environment variable schema and validation function.
- `app.config.ts`: app name, port, prefix, CORS, environment.
- `database.config.ts`: database URL and database behavior.
- `jwt.config.ts`: JWT secrets and expiry values.
- `redis.config.ts`: Redis host, port, password, database, and TTL.
- `swagger.config.ts`: Swagger document and UI mounting.
- `index.ts`: config exports.

## Dependencies

- `@nestjs/config` provides module and service integration.
- `class-transformer` converts strings to booleans and numbers.
- `class-validator` validates required shape.
- Swagger setup depends on `@nestjs/swagger`.

## Complexity And Risk

- Low to medium complexity.
- Highest-risk area: required secrets. If validation is relaxed, the app may boot with unsafe defaults.
- `IMAGE_ENCRYPTION_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `DATABASE_URL` are required.
- Config file load order should match deployment expectations. Review `envFilePath` in `AppModule` before changing environment behavior.

## Adding Config

1. Add the environment variable to `EnvironmentVariables`.
2. Add validation decorators and defaults only when safe.
3. Expose it through a config namespace if multiple places need it.
4. Update `docs/ENV_CONFIGURATION.md` and this guide.

