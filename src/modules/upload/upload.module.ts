import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { UploadConfigService } from './config/upload-config.service';
import { UploadProviderName } from './config/upload-config.interface';
import {
  PRESIGNED_URL_PROVIDER,
  STORAGE_PROVIDER,
} from './constants/upload.constants';
import { LocalDirectUploadController } from './controllers/local-direct.controller';
import { IPresignedUrlProvider } from './interfaces/presigned-url.interface';
import { IStorageProvider } from './interfaces/storage-provider.interface';
import { CloudflareR2StorageProvider } from './providers/cloudflare-r2-storage.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';
import { ImageKitStorageProvider } from './providers/imagekit-storage.provider';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { AuditLoggerService } from './services/audit-logger.service';
import { FileProcessorService } from './services/file-processor.service';
import { FileValidatorService } from './services/file-validator.service';
import { LocalSignedUrlService } from './services/local-signed-url.service';
import { PresignedUrlService } from './services/presigned-url.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

/**
 * Provider class registry — the OCP extension point.
 *
 * Adding a new storage backend is exactly two changes:
 *   1. Create a new provider class implementing IStorageProvider (and
 *      optionally IPresignedUrlProvider) under ./providers/.
 *   2. Add one entry to PROVIDER_CLASS_REGISTRY below mapping the
 *      UPLOAD_PROVIDER name to the class constructor.
 *
 * UploadController, UploadService, PresignedUrlService, and every other file
 * stay untouched. That is the closed-for-modification half of OCP.
 */
type StorageProviderClass = Type<IStorageProvider & IPresignedUrlProvider>;

const PROVIDER_CLASS_REGISTRY: Partial<Record<UploadProviderName, StorageProviderClass>> = {
  local: LocalStorageProvider,
  s3: S3StorageProvider,
  cloudflare: CloudflareR2StorageProvider,
  cloudinary: CloudinaryStorageProvider,
  imagekit: ImageKitStorageProvider,
  // gcs / azure: add provider classes here when implemented.
};

/**
 * UploadModule — root module for the upload feature.
 *
 * Use UploadModule.forRoot() in AppModule. The static factory:
 *  - reads UPLOAD_PROVIDER from process.env (already loaded by ConfigModule).
 *  - looks up the matching class in PROVIDER_CLASS_REGISTRY.
 *  - registers ONLY that class as a Nest provider so cloud SDKs aren't
 *    instantiated when not needed.
 *  - binds the same instance to both STORAGE_PROVIDER and PRESIGNED_URL_PROVIDER
 *    DI tokens via { useExisting: ProviderClass } — no double instantiation.
 *
 * Local-only extras
 *  When UPLOAD_PROVIDER=local we also register:
 *   - LocalSignedUrlService  : HMAC signer/verifier for local presigned URLs
 *   - LocalDirectUploadController : public PUT/GET routes the signer points at
 *  …and apply express.raw() middleware to the PUT route so the request body
 *  arrives as a Buffer rather than going through the JSON parser.
 */
@Module({})
export class UploadModule {
  static forRoot(): DynamicModule {
    const providerName = (process.env.UPLOAD_PROVIDER || 'local') as UploadProviderName;
    const ProviderClass = PROVIDER_CLASS_REGISTRY[providerName];
    if (!ProviderClass) {
      throw new Error(
        `UploadModule: no provider class registered for UPLOAD_PROVIDER="${providerName}". ` +
          `Supported: ${Object.keys(PROVIDER_CLASS_REGISTRY).join(', ')}.`,
      );
    }

    const isLocal = providerName === 'local';

    const providers: Provider[] = [
      UploadConfigService,
      FileValidatorService,
      FileProcessorService,
      AuditLoggerService,
      PresignedUrlService,
      UploadService,
      ProviderClass,
      { provide: STORAGE_PROVIDER, useExisting: ProviderClass },
      { provide: PRESIGNED_URL_PROVIDER, useExisting: ProviderClass },
    ];

    const controllers: Type<unknown>[] = [UploadController];

    if (isLocal) {
      // Inject the signer into LocalStorageProvider (the @Optional() dep)
      // by adding it to the providers list — Nest resolves it automatically.
      providers.push(LocalSignedUrlService);
      controllers.push(LocalDirectUploadController);
    }

    return {
      module: UploadModule,
      controllers,
      providers,
      exports: [
        UploadService,
        PresignedUrlService,
        UploadConfigService,
        STORAGE_PROVIDER,
        PRESIGNED_URL_PROVIDER,
      ],
    };
  }

  /** Convenience — same as forRoot(). */
  static register(): DynamicModule {
    return UploadModule.forRoot();
  }

  // Note: the express.raw() body parser for PUT /upload/local/direct is
  // registered in main.ts (not here) because module-level forRoutes() path
  // matching is ambiguous about whether it includes the global API prefix,
  // whereas main.ts has direct access to the Express app and can match the
  // exact prefixed URL deterministically.
}
