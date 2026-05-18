import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './services/encryption.service';

/**
 * SharedModule — @Global() module that publishes reusable services.
 *
 * Responsibility
 *  Provides cross-cutting injectable utilities that aren't bound to any single
 *  feature module. Today this is just `EncryptionService` (AES-256-CBC for
 *  sensitive file storage); add new shared services here.
 *
 * Why @Global()
 *  Avoids forcing every consumer (UploadService, future encryption-using
 *  services) to import SharedModule explicitly. Pair with @Injectable() and
 *  the DI container resolves it anywhere.
 *
 * What does NOT live here anymore
 *  - CacheService / CacheModule  → moved to `src/core/cache` (system concern).
 *  - PrismaService / PrismaModule → in `src/core/database` (@Global there).
 *
 * Used by: AppModule → imports: [..., SharedModule]
 */
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class SharedModule {}
