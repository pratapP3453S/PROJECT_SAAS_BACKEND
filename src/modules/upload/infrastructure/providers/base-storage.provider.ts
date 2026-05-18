import { Logger } from '@nestjs/common';
import {
  IStorageProvider,
  ObjectHead,
  SaveFileInput,
  StoredFile,
} from '../../domain/interfaces/storage-provider.interface';

/**
 * BaseStorageProvider — common utilities for every concrete IStorageProvider.
 *
 * Layer: infrastructure/providers — base class for backend adapters.
 *
 * Lives between the IStorageProvider contract and concrete providers
 * (Local, S3, R2, Cloudinary, ImageKit, …). Holds:
 *   - the named Logger instance
 *   - URL/key normalisation helpers
 *   - the safe-segment sanitiser
 *   - default head() that returns { exists: false } for providers that
 *     can't or don't need to support it
 */
export abstract class BaseStorageProvider implements IStorageProvider {
  protected readonly logger: Logger;

  constructor(providerName: string) {
    this.logger = new Logger(`${providerName}StorageProvider`);
  }

  abstract saveTemp(input: SaveFileInput): Promise<StoredFile>;
  abstract commitToPermanent(filename: string, type: string): Promise<StoredFile>;
  abstract delete(fileUrl: string): Promise<boolean>;
  abstract cleanupTemp(olderThanHours?: number): Promise<number>;

  async head(_fileKey: string): Promise<ObjectHead> {
    return { exists: false, size: 0 };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  protected normalizePath(path: string): string {
    return path
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/|\/$/g, '');
  }

  protected buildFileKey(prefix: string, subdirectory: string, filename: string): string {
    return this.normalizePath(`${prefix}/${subdirectory}/${filename}`);
  }

  protected extractFilename(fileUrl: string): string {
    const noQuery = fileUrl.split('?')[0];
    return noQuery.split('/').pop() || '';
  }

  protected getAgeInHours(mtimeMs: number): number {
    return (Date.now() - mtimeMs) / (60 * 60 * 1000);
  }

  /** Whitelist subdirectory characters — guards against ./../ and friends. */
  protected safeSegment(value: string): string {
    return (value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  protected logSuccess(message: string): void {
    this.logger.log(message);
  }

  protected logError(operation: string, error: Error): void {
    this.logger.error(`${operation} failed: ${error.message}`, error.stack);
  }
}
