/**
 * Base Storage Provider — abstract class for common storage logic
 *
 * Provides common functionality that all storage providers share:
 * - URL building
 * - Error handling
 * - Logging
 * - Common path normalization
 *
 * Each provider (Local, S3, Cloudflare, GCS, Azure) extends this and
 * implements the abstract methods specific to that backend.
 */

import { Logger } from '@nestjs/common';
import {
  IStorageProvider,
  SaveFileInput,
  StoredFile,
} from '../interfaces/storage-provider.interface';

export abstract class BaseStorageProvider implements IStorageProvider {
  protected readonly logger: Logger;

  constructor(providerName: string) {
    this.logger = new Logger(`${providerName}StorageProvider`);
  }

  /**
   * Persist a file to temporary staging storage.
   * Each provider implements differently.
   */
  abstract saveTemp(input: SaveFileInput): Promise<StoredFile>;

  /**
   * Promote temp file to permanent storage.
   * Each provider implements differently.
   */
  abstract commitToPermanent(filename: string, type: string): Promise<StoredFile>;

  /**
   * Delete a file by URL.
   * Each provider implements differently.
   */
  abstract delete(fileUrl: string): Promise<boolean>;

  /**
   * Clean up stale temp files.
   * Each provider implements differently.
   */
  abstract cleanupTemp(olderThanHours?: number): Promise<number>;

  /**
   * Common utility: normalizes a file path or URL.
   * Removes leading/trailing slashes, double slashes, etc.
   *
   * @param path - File path/URL
   * @returns Normalized path
   */
  protected normalizePath(path: string): string {
    return path
      .replace(/\\/g, '/') // Convert backslashes to forward slashes
      .replace(/\/+/g, '/') // Remove double slashes
      .replace(/^\/|\/$/g, ''); // Remove leading/trailing slashes
  }

  /**
   * Common utility: builds a file key for storage.
   * Example: 'uploads/temp/abc-123.webp'
   *
   * @param subdirectory - Subdirectory (e.g., 'temp', 'avatar')
   * @param filename - File name
   * @returns Full file key
   */
  protected buildFileKey(subdirectory: string, filename: string): string {
    const normalized = this.normalizePath(`uploads/${subdirectory}/${filename}`);
    return normalized;
  }

  /**
   * Common utility: builds a URL for a file.
   *
   * @param fileKey - File key in storage
   * @returns URL (can be relative or absolute depending on provider)
   */
  protected buildFileUrl(fileKey: string): string {
    return `/${fileKey}`;
  }

  /**
   * Common utility: extracts filename from URL.
   * Example: '/uploads/temp/abc.webp' → 'abc.webp'
   *
   * @param fileUrl - File URL
   * @returns Filename
   */
  protected extractFilename(fileUrl: string): string {
    return fileUrl.split('/').pop() || '';
  }

  /**
   * Common utility: calculates age in hours from timestamp.
   *
   * @param mtimeMs - Modification time in milliseconds
   * @returns Age in hours
   */
  protected getAgeInHours(mtimeMs: number): number {
    const ageMs = Date.now() - mtimeMs;
    return ageMs / (60 * 60 * 1000);
  }

  /**
   * Common error logging.
   */
  protected logError(operation: string, error: Error): void {
    this.logger.error(`${operation} failed: ${error.message}`, error.stack);
  }

  /**
   * Common success logging.
   */
  protected logSuccess(message: string): void {
    this.logger.log(message);
  }
}
