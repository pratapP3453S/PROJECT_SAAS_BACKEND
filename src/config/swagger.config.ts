import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

/**
 * setupSwagger — mounts the Swagger UI onto the running NestJS application.
 *
 * Responsibility: Builds an OpenAPI document from the application metadata
 * and serves it via SwaggerModule. Called once in bootstrap() after the app
 * is created but before app.listen().
 *
 * Flow:
 * 1. Read SWAGGER_ENABLED from ConfigService — returns early if false (production).
 * 2. Build OpenAPI config via DocumentBuilder:
 *    - Title, description, version from config (app.name, app.version).
 *    - BearerAuth scheme ('JWT-auth') matches @ApiBearerAuth('JWT-auth') on controllers.
 *    - Tags: Auth, Users, Upload, Health — determine sidebar grouping in the UI.
 * 3. SwaggerModule.createDocument() — traverses all controllers and generates the spec.
 * 4. SwaggerModule.setup(path, app, document) — serves:
 *    - Swagger UI at /{SWAGGER_PATH} (default: /docs)
 *    - Raw JSON spec at /{SWAGGER_PATH}-json
 * 5. persistAuthorization:true — keeps Bearer token across page refreshes in the UI.
 *
 * Called by: bootstrap() in src/main.ts
 * Disabled in production via: SWAGGER_ENABLED=false
 */
export function setupSwagger(app: INestApplication): void {
  const configService = app.get(ConfigService);

  const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED', true);
  if (!swaggerEnabled) return;

  const swaggerPath = configService.get<string>('SWAGGER_PATH', 'docs');
  const appName = configService.get<string>('app.name', 'NestJS Enterprise API');
  const appVersion = configService.get<string>('app.version', '1.0.0');

  const config = new DocumentBuilder()
    .setTitle(appName)
    .setDescription(
      `## ${appName}\n\nEnterprise-level NestJS API with full DI architecture.\n\n` +
        `### Authentication\nUse the **Authorize** button to set your Bearer token.\n\n` +
        `### Response Format\nAll responses follow a standardized format with \`success\`, \`statusCode\`, \`message\`, and \`data\` fields.`,
    )
    .setVersion(appVersion)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('Upload', 'File upload endpoints')
    .addTag('Health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: `${appName} - API Docs`,
  });

  console.log(`📚 Swagger docs available at: /${swaggerPath}`);
}
