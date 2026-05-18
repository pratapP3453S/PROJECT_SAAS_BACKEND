import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule — @Global() module that provides PrismaService to the whole app.
 *
 * Responsibility: Declares PrismaService as a singleton provider and exports it
 * so every module has access to the database client without importing PrismaModule
 * explicitly. The @Global() decorator makes the export available application-wide.
 *
 * Usage pattern in feature modules: Because PrismaModule is global, repositories
 * can inject PrismaService via NestJS DI without listing PrismaModule in their
 * module's `imports` array.
 *
 * Imported by: AppModule (once, at the root level).
 * See also: PrismaService → src/core/database/prisma/prisma.service.ts
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
