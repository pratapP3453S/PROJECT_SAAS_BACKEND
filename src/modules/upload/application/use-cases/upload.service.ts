import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Errors } from '../../../../shared/constants/error.constants';
import { ApiError } from '../../../../core/exceptions/api.error';
import { EncryptionService } from '../../../../shared/services/encryption.service';
import { UploadConfigService } from '../../infrastructure/config/upload-config.service';
import { STORAGE_PROVIDER } from '../../domain/constants/upload.constants';
import { AuditLogEntry, FileOperationType } from '../../domain/interfaces/audit-logger.interface';
import { IStorageProvider } from '../../domain/interfaces/storage-provider.interface';
import { MoveFileResult, UploadResult } from '../../domain/entities/upload.entity';
import { AuditLoggerService } from '../../infrastructure/audit/audit-logger.service';
import { FileProcessorService } from '../../domain/services/file-processor.service';
import { FileValidatorService } from '../../domain/services/file-validator.service';

interface UploadContext {
  userId?: string;
  requestId?: string;
}

/**
 * UploadService — application use-case orchestration for file uploads.
 *
 * Layer: application/use-cases — coordinates the domain services (validator,
 * processor), the encryption helper (shared), the active storage provider
 * (infrastructure via STORAGE_PROVIDER token), and the audit logger.
 * Controllers depend on this class; this class never depends on controllers.
 *
 * Pipeline (processFile):
 *  1. Audit START
 *  2. Validate (MIME, size, magic bytes)
 *  3. Read raw bytes from Multer's temp path
 *  4. Process (Sharp pipeline for images; pass-through for video/audio/docs)
 *  5. Encrypt buffer if the category requires it
 *  6. Save to provider temp storage
 *  7. Audit SUCCESS + clean up Multer's local file
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly uploadConfig: UploadConfigService,
    private readonly fileValidator: FileValidatorService,
    private readonly fileProcessor: FileProcessorService,
    private readonly auditLogger: AuditLoggerService,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: IStorageProvider,
  ) {}

  async processFile(
    file: Express.Multer.File,
    type: string,
    context: UploadContext = {},
  ): Promise<UploadResult> {
    const startedAt = Date.now();
    const auditEntry = this.createAuditEntry(FileOperationType.UPLOAD_START, type, context, {
      fileName: file.originalname,
      fileSizeBytes: file.size,
      mimeType: file.mimetype,
    });

    try {
      const validationErrors = await this.fileValidator.validate(file, type);
      if (validationErrors.length > 0) {
        auditEntry.status = 'failure';
        auditEntry.errorMessage = validationErrors.map((error) => error.code).join(', ');
        auditEntry.durationMs = Date.now() - startedAt;
        await this.auditLogger.log(auditEntry);
        throw ApiError.fromDefinition(Errors.INVALID_FILE_TYPE, {
          details: validationErrors.map((error) => error.message).join('; '),
        });
      }

      const rawBuffer = await fs.readFile(file.path);
      const typeConfig = this.uploadConfig.getFileTypeConfig(type);
      const processedFile = await this.fileProcessor.process(
        rawBuffer,
        typeConfig.processing ?? {},
        {
          fallbackMimeType: file.mimetype,
          fallbackExtension: path.extname(file.originalname).replace('.', ''),
        },
      );

      const shouldEncrypt = this.uploadConfig.shouldEncrypt(type);
      const finalBuffer = shouldEncrypt
        ? this.encryptionService.encryptBuffer(processedFile.buffer)
        : processedFile.buffer;

      const serverFileName = this.buildServerFileName(file.filename, processedFile.format);
      const stored = await this.storageProvider.saveTemp({
        buffer: finalBuffer,
        filename: serverFileName,
        mimeType: processedFile.mimeType,
        size: finalBuffer.length,
        isEncrypted: shouldEncrypt,
        uploadType: type,
        metadata: {
          originalFileName: file.originalname,
          provider: this.uploadConfig.getActiveProvider(),
        },
      });

      await this.safeRemoveRawFile(file.path);

      auditEntry.status = 'success';
      auditEntry.operation = FileOperationType.UPLOAD_COMPLETE;
      auditEntry.fileKey = stored.url;
      auditEntry.encrypted = shouldEncrypt;
      auditEntry.durationMs = Date.now() - startedAt;
      await this.auditLogger.log(auditEntry);

      this.logger.log(
        `Upload processed: ${stored.filename} type=${type} encrypted=${shouldEncrypt}`,
      );

      return {
        tempUrl: stored.url,
        serverFileName: stored.filename,
        originalFileName: file.originalname,
        mimeType: processedFile.mimeType,
        size: stored.size,
        isEncrypted: shouldEncrypt,
      };
    } catch (error) {
      await this.safeRemoveRawFile(file.path);

      auditEntry.status = 'failure';
      auditEntry.operation = FileOperationType.UPLOAD_FAILED;
      auditEntry.errorMessage = (error as Error).message;
      auditEntry.durationMs = Date.now() - startedAt;
      await this.auditLogger.log(auditEntry);

      throw error;
    }
  }

  /**
   * Promote a temp file to its permanent location.
   *
   * `tempIdentifier` may be either:
   *  - a flat filename (server-mediated upload — leaf of the tempUrl), or
   *  - a full temp key like "uploads/temp/u-7/aadhar/abc.png" (presigned upload).
   *
   * The active storage provider detects the form and resolves the source object
   * accordingly. Both forms commit to the same permanent shape:
   *   {permanentPrefix}/{type}/{filename}.
   */
  async commitFile(
    tempIdentifier: string,
    type: string,
    context: UploadContext = {},
  ): Promise<MoveFileResult> {
    const startedAt = Date.now();
    const auditEntry = this.createAuditEntry(FileOperationType.COMMIT, type, context, {
      fileName: tempIdentifier,
    });

    try {
      this.uploadConfig.getFileTypeConfig(type);
      const stored = await this.storageProvider.commitToPermanent(tempIdentifier, type);

      auditEntry.status = 'success';
      auditEntry.fileKey = stored.url;
      auditEntry.durationMs = Date.now() - startedAt;
      await this.auditLogger.log(auditEntry);

      return { permanentUrl: stored.url, serverFileName: stored.filename };
    } catch (error) {
      auditEntry.status = 'failure';
      auditEntry.errorMessage = (error as Error).message;
      auditEntry.durationMs = Date.now() - startedAt;
      await this.auditLogger.log(auditEntry);
      throw error;
    }
  }

  async removeFile(fileUrl: string, context: UploadContext = {}): Promise<boolean> {
    const startedAt = Date.now();
    const auditEntry = this.createAuditEntry(FileOperationType.DELETE, undefined, context, {
      fileKey: fileUrl,
    });

    try {
      const deleted = await this.storageProvider.delete(fileUrl);
      auditEntry.status = deleted ? 'success' : 'failure';
      auditEntry.durationMs = Date.now() - startedAt;
      await this.auditLogger.log(auditEntry);
      return deleted;
    } catch (error) {
      auditEntry.status = 'failure';
      auditEntry.errorMessage = (error as Error).message;
      auditEntry.durationMs = Date.now() - startedAt;
      await this.auditLogger.log(auditEntry);
      throw error;
    }
  }

  async cleanupTemp(
    olderThanHours = this.uploadConfig.getConfig().tempRetentionHours,
  ): Promise<number> {
    const auditEntry = this.createAuditEntry(
      FileOperationType.CLEANUP,
      undefined,
      {},
      {
        metadata: { olderThanHours },
      },
    );

    try {
      const deleted = await this.storageProvider.cleanupTemp(olderThanHours);
      auditEntry.status = 'success';
      auditEntry.metadata = { olderThanHours, deleted };
      await this.auditLogger.log(auditEntry);
      return deleted;
    } catch (error) {
      auditEntry.status = 'failure';
      auditEntry.errorMessage = (error as Error).message;
      await this.auditLogger.log(auditEntry);
      return 0;
    }
  }

  private createAuditEntry(
    operation: FileOperationType,
    uploadType: string | undefined,
    context: UploadContext,
    overrides: Partial<AuditLogEntry> = {},
  ): AuditLogEntry {
    return {
      operation,
      timestamp: new Date(),
      userId: context.userId,
      requestId: context.requestId,
      uploadType,
      provider: this.uploadConfig.getActiveProvider(),
      status: 'pending',
      ...overrides,
    };
  }

  private buildServerFileName(originalServerName: string, extension: string): string {
    const baseName = path.parse(originalServerName).name;
    const normalizedExtension = extension.replace('.', '').toLowerCase() || 'bin';
    return `${baseName}.${normalizedExtension}`;
  }

  private async safeRemoveRawFile(filePath: string): Promise<void> {
    if (!filePath) return;

    try {
      await fs.unlink(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(`Raw upload cleanup failed for ${filePath}: ${(error as Error).message}`);
      }
    }
  }
}
