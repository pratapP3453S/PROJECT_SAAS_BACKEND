import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Errors } from '../../common/constants/error.constants';
import { ApiError } from '../../common/errors/api.error';
import { EncryptionService } from '../../shared/services/encryption.service';
import { UploadConfigService } from './config/upload-config.service';
import { STORAGE_PROVIDER } from './constants/upload.constants';
import { AuditLogEntry, FileOperationType } from './interfaces/audit-logger.interface';
import { IStorageProvider } from './interfaces/storage-provider.interface';
import { MoveFileResult, UploadResult } from './interfaces/upload.interface';
import { AuditLoggerService } from './services/audit-logger.service';
import { FileProcessorService } from './services/file-processor.service';
import { FileValidatorService } from './services/file-validator.service';

interface UploadContext {
  userId?: string;
  requestId?: string;
}

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

  async commitFile(
    filename: string,
    type: string,
    context: UploadContext = {},
  ): Promise<MoveFileResult> {
    const startedAt = Date.now();
    const auditEntry = this.createAuditEntry(FileOperationType.COMMIT, type, context, {
      fileName: filename,
    });

    try {
      this.uploadConfig.getFileTypeConfig(type);
      const stored = await this.storageProvider.commitToPermanent(filename, type);

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
