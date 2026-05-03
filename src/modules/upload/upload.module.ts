import { Module } from '@nestjs/common';
import { UploadConfigService } from './config/upload-config.service';
import { STORAGE_PROVIDER } from './constants/upload.constants';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { AuditLoggerService } from './services/audit-logger.service';
import { FileProcessorService } from './services/file-processor.service';
import { FileValidatorService } from './services/file-validator.service';
import { PresignedUrlService } from './services/presigned-url.service';

@Module({
  controllers: [UploadController],
  providers: [
    UploadConfigService,
    FileValidatorService,
    FileProcessorService,
    AuditLoggerService,
    PresignedUrlService,
    UploadService,
    LocalStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [UploadConfigService, LocalStorageProvider],
      useFactory: (
        uploadConfig: UploadConfigService,
        localStorageProvider: LocalStorageProvider,
      ) => {
        const provider = uploadConfig.getActiveProvider();

        if (provider === 'local') {
          return localStorageProvider;
        }

        throw new Error(
          `Upload provider "${provider}" is configured but no provider binding is installed. ` +
            'Add the provider class to UploadModule and bind it through STORAGE_PROVIDER.',
        );
      },
    },
  ],
  exports: [UploadService, PresignedUrlService, UploadConfigService, STORAGE_PROVIDER],
})
export class UploadModule {}
