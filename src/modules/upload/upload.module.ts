import { DynamicModule, Module } from '@nestjs/common';
import { UploadV1Module } from './api/v1/upload-v1.module';

/**
 * UploadModule — feature aggregator for file uploads.
 *
 * Composes the versioned API submodules. Today only v1 exists; copy
 * `api/v1/` to `api/v2/` and add a `UploadV2Module.forRoot()` call here when
 * a breaking v2 lands.
 *
 * Use `UploadModule.forRoot()` in AppModule — the factory delegates to
 * `UploadV1Module.forRoot()` which reads UPLOAD_PROVIDER and wires the
 * matching storage backend.
 *
 * Layout under modules/upload/
 *  - domain/         entity types, port interfaces, DI tokens, pure domain services
 *  - infrastructure/ storage providers, config, multer factory, audit sink, HMAC signer
 *  - application/    use-case services (UploadService, PresignedUrlService)
 *  - api/v1/         controllers, request DTOs, v1 module factory
 *  - upload.module.ts this file (composition root)
 */
@Module({})
export class UploadModule {
  static forRoot(): DynamicModule {
    const v1 = UploadV1Module.forRoot();
    return {
      module: UploadModule,
      imports: [v1],
      exports: [v1],
    };
  }

  /** Convenience — same as forRoot(). */
  static register(): DynamicModule {
    return UploadModule.forRoot();
  }
}
