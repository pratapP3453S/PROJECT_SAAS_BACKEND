/**
 * storage-provider.interface — contract for all file storage backends.
 *
 * Responsibility: Defines the storage abstraction that UploadService depends on.
 * Every storage backend (local disk, S3, Cloudinary, GCS, etc.) must implement
 * IStorageProvider. UploadService never imports a concrete provider — it only
 * knows this interface, injected via STORAGE_PROVIDER token.
 *
 * Types:
 *
 *  SaveFileInput
 *   Carries the processed file buffer and metadata that a provider needs to
 *   persist the file. The buffer is always post-Sharp (WebP) and optionally
 *   post-encryption. Size and MIME type are derived at the Service layer so
 *   providers do not need to re-stat the file.
 *   Fields:
 *    buffer       : final byte content (converted, possibly encrypted)
 *    filename     : UUID-based name with .webp extension (no path component)
 *    mimeType     : always 'image/webp' after Sharp conversion
 *    size         : byte length of `buffer`
 *    isEncrypted  : whether AES-256 was applied (stored for DB record)
 *
 *  StoredFile
 *   Returned by saveTemp() and commitToPermanent().
 *   Fields:
 *    url          : relative URL the API serves (e.g. /uploads/temp/abc.webp)
 *    filename     : server-assigned UUID filename (used for subsequent moves)
 *    size         : final byte size (may differ from input if remote CDN re-encodes)
 *
 * IStorageProvider:
 *
 *  saveTemp(input):
 *   Persist the processed file to temporary staging storage.
 *   For local disk: writes to uploads/temp/.
 *   For S3: uploads to s3://{bucket}/temp/ with a short expiry tag.
 *   Returns StoredFile with the temp URL.
 *
 *  commitToPermanent(filename, type):
 *   Move/copy the temp file to its permanent location under the given type.
 *   For local disk: renames uploads/temp/{filename} → uploads/{type}/{filename}.
 *   For S3: copies s3://temp/{filename} → s3://{type}/{filename}, then deletes source.
 *   Returns StoredFile with the permanent URL.
 *   Throws: 404 ERR_FILE_NOT_FOUND if the temp file no longer exists.
 *
 *  delete(fileUrl):
 *   Delete a file identified by its relative URL.
 *   Implementations must be idempotent — return false (not throw) if the file
 *   does not exist, so callers can decide whether to surface a 404.
 *   Returns true on successful deletion, false if the file was already gone.
 *
 *  cleanupTemp(olderThanHours?):
 *   Purge temp files older than the given threshold (default: 24 hours).
 *   Designed to be called by a scheduled CronJob.
 *   Returns the count of deleted files.
 *   Implementations must catch and log internal errors rather than throwing,
 *   so a partial failure does not crash a recurring cleanup job.
 *
 * Implementing a new provider (example — S3):
 *  1. Create src/modules/upload/providers/s3-storage.provider.ts
 *     export class S3StorageProvider implements IStorageProvider { ... }
 *  2. In upload.module.ts change:
 *     { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider }
 *     →
 *     { provide: STORAGE_PROVIDER, useClass: S3StorageProvider }
 *  3. No changes to UploadService, UploadController, or any other file.
 */

export interface SaveFileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
  isEncrypted: boolean;
  uploadType?: string;
  metadata?: Record<string, string>;
}

export interface StoredFile {
  url: string;
  filename: string;
  size: number;
  key?: string;
}

export interface IStorageProvider {
  /**
   * Persist a processed file to temporary staging storage.
   * Called by: UploadService.processFile() after Sharp conversion + optional encryption.
   *
   * @param input - Processed file buffer with metadata.
   * @returns StoredFile with the temp URL and filename for subsequent commit.
   */
  saveTemp(input: SaveFileInput): Promise<StoredFile>;

  /**
   * Promote a temp file to its permanent location under the given type.
   * Called by: UploadService.commitFile() after the caller has committed the
   * DB record with the temp URL.
   *
   * @param filename - UUID filename returned by saveTemp().
   * @param type     - Target category/subdirectory (e.g. 'avatar', 'document').
   * @returns StoredFile with the permanent URL.
   * @throws 404 ERR_FILE_NOT_FOUND — temp file is missing or already committed.
   */
  commitToPermanent(filename: string, type: string): Promise<StoredFile>;

  /**
   * Delete a file by its relative URL.
   * Called by: UploadService.removeFile().
   * Implementations must be idempotent — return false when the file is absent.
   *
   * @param fileUrl - Relative URL (e.g. /uploads/temp/abc.webp).
   * @returns true if deleted, false if the file was not found.
   */
  delete(fileUrl: string): Promise<boolean>;

  /**
   * Purge stale temp files older than the given threshold.
   * Called by: a scheduled CronJob / BullMQ recurring task.
   * Implementations must not throw — catch and log errors internally.
   *
   * @param olderThanHours - Age threshold in hours (default: 24).
   * @returns Number of files deleted.
   */
  cleanupTemp(olderThanHours?: number): Promise<number>;
}
