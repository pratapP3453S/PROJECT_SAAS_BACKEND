import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import * as path from 'path';
import { AppModule } from './app.module';
import { AppValidationPipe } from './core/pipes/validation.pipe';
import { setupSwagger } from './core/config/swagger.config';

/**
 * bootstrap — application entry point.
 *
 * Responsibility: Wires all cross-cutting concerns onto the NestJS application
 * instance before it begins accepting traffic. Contains no business logic.
 *
 * Startup sequence:
 * 1. NestFactory.create<NestExpressApplication>(AppModule) — creates the app;
 *    bufferLogs=true holds log output until the logger is ready, cors=false
 *    disables the built-in CORS so we can configure it manually below.
 * 2. helmet() — sets HTTP security headers (XSS, clickjacking, MIME sniffing).
 *    crossOriginResourcePolicy=cross-origin allows static file serving across
 *    origins; contentSecurityPolicy disabled for Swagger UI compatibility.
 * 3. compression() — gzip/brotli response compression via the `compression` pkg.
 * 4. enableCors() — restricts allowed origins to CORS_ORIGINS env var (comma-
 *    separated list); credentials=true allows cookie-based auth alongside Bearer.
 * 5. setGlobalPrefix(API_PREFIX) — defaults to "api"; routes become /api/v1/...
 *    once URI versioning is enabled below. /health and /health/ping are
 *    excluded so K8s probes work on a stable, unversioned path.
 * 6. enableVersioning({ type: URI }) — Nest tacks /v{n} immediately after the
 *    global prefix when a controller declares `version: 'N'`. AuthController
 *    / UserController / UploadController all opt in; LocalDirectUploadController
 *    intentionally does NOT version because signed URLs are bearer credentials
 *    minted for a specific path.
 * 7. useGlobalPipes(AppValidationPipe) — class-validator DTO validation with
 *    structured FieldError[] output (whitelist, forbidNonWhitelisted).
 * 8. useStaticAssets(uploads/) — serves uploaded files at /uploads/* via Express.
 * 9. setupSwagger(app) — mounts Swagger UI at /docs (if SWAGGER_ENABLED=true).
 * 10. app.listen(PORT, '0.0.0.0') — binds to all interfaces for Docker compatibility.
 *
 * Throws: process.exit(1) if bootstrap fails, preventing a silent crash-loop.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    cors: false, // Configured manually below
    // rawBody:true tells NestJS to also keep the un-parsed body bytes on
    // req.rawBody alongside the parsed req.body. Critical for the local
    // presigned upload route (PUT /upload/local/direct) which receives
    // raw file bytes — without this the body-parser silently consumes the
    // stream and the handler sees an empty body.
    rawBody: true,
  });

  // ─── Security ─────────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  // ─── Compression ──────────────────────────────────────────────────────────
  app.use(compression());

  // ─── CORS ─────────────────────────────────────────────────────────────────
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`Blocked CORS origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Idempotency-Key',
      'Cache-Control',
      'Accept',
      'Origin',
    ],
    credentials: true,
  });

  // ─── API Prefix & URI Versioning ──────────────────────────────────────────
  // API_PREFIX is the base (default "api"). enableVersioning + per-controller
  // `version: '1'` produces /api/v1/... at runtime. Controllers without a
  // version (e.g. /health) live directly under the global prefix or, when
  // explicitly excluded, at the root.
  const apiPrefix = process.env.API_PREFIX || 'api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'health/ping', 'upload/local/direct'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: process.env.DEFAULT_API_VERSION || '1',
  });

  // ─── Validation Pipe ──────────────────────────────────────────────────────
  app.useGlobalPipes(new AppValidationPipe());

  // ─── Static Files ─────────────────────────────────────────────────────────
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // ─── Swagger ──────────────────────────────────────────────────────────────
  setupSwagger(app);

  // ─── Start ────────────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT || '5001', 10);
  await app.listen(port, '0.0.0.0');

  const defaultVersion = process.env.DEFAULT_API_VERSION || '1';
  logger.log(`Application is running on: http://localhost:${port}/${apiPrefix}/v${defaultVersion}`);
  logger.log(`Swagger docs: http://localhost:${port}/${process.env.SWAGGER_PATH || 'docs'}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Application failed to start:', err);
  process.exit(1);
});
