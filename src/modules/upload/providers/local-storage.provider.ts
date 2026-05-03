import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Errors } from '../../../common/constants/error.constants';
import { ApiError } from '../../../common/errors/api.error';
import { UploadConfigService } from '../config/upload-config.service';
import {
  IStorageProvider,
  SaveFileInput,
  StoredFile,
} from '../interfaces/storage-provider.interface';

/**
 * LocalStorageProvider — IStorageProvider implementation backed by the local filesystem.
 *
 * Responsibility: Handles all byte-level I/O for the upload feature when running
 * on a single server with a local disk. Implements IStorageProvider so it can be
 * swapped for S3StorageProvider or CloudinaryStorageProvider by changing one line
 * in UploadModule — no changes to UploadService or UploadController.
 *
 * Storage layout (relative to process.cwd()):
 *  uploads/
 *    temp/         ← saveTemp() writes here; Multer also writes raw uploads here
 *    {type}/       ← commitToPermanent() moves the processed file here
 *
 * URL convention:
 *  Temp    : /uploads/temp/{filename}
 *  Permanent: /uploads/{type}/{filename}
 *
 * Methods (implements IStorageProvider):
 *  saveTemp(input)                 : fs.writeFileSync(uploads/temp/{filename}, buffer)
 *  commitToPermanent(filename,type): fs.renameSync(temp → uploads/{type}/{filename})
 *  delete(fileUrl)                 : fs.promises.unlink(resolved absolute path)
 *  cleanupTemp(olderThanHours=24)  : stat each file in uploads/temp/, unlink if stale
 *
 * Injected by: UploadModule → { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider }
 * Consumed by: UploadService via @Inject(STORAGE_PROVIDER) private storage: IStorageProvider
 *
 * To migrate to S3:
 *  1. Create S3StorageProvider implements IStorageProvider.
 *  2. Change UploadModule: useClass: LocalStorageProvider → useClass: S3StorageProvider.
 *  3. LocalStorageProvider can be deleted or kept for local/dev environments.
 */
@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseDir: string;
  private readonly tempDir: string;

  constructor(private readonly uploadConfig: UploadConfigService) {
    this.baseDir = path.resolve(process.cwd(), this.uploadConfig.getConfig().localStoragePath);
    this.tempDir = path.join(this.baseDir, 'temp');
    this.ensureDir(this.baseDir);
    this.ensureDir(this.tempDir);
  }

  /**
   * Creates a directory (and all missing parents) if it does not already exist.
   * Called by: constructor (uploads/, uploads/temp/), commitToPermanent().
   *
   * @param dir - Absolute path to the directory to create.
   */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Writes a processed file buffer to uploads/temp/ on the local filesystem.
   * Called by: UploadService.processFile() after Sharp conversion + optional encryption.
   *
   * Flow:
   * 1. ensureDir(uploads/temp/) — guard against manual directory deletion at runtime.
   * 2. Build the absolute destination path: uploads/temp/{input.filename}.
   * 3. fs.writeFileSync(destPath, input.buffer) — synchronous write (atomic on most OSes).
   * 4. Return StoredFile { url: '/uploads/temp/{filename}', filename, size }.
   *
   * @param input - SaveFileInput with the processed buffer and metadata.
   * @returns StoredFile with the temp URL.
   */
  async saveTemp(input: SaveFileInput): Promise<StoredFile> {
    this.ensureDir(this.tempDir);
    const safeFilename = path.basename(input.filename);
    const destPath = path.join(this.tempDir, safeFilename);
    fs.writeFileSync(destPath, input.buffer);
    this.logger.log(`File saved to temp: ${safeFilename}`);
    return {
      url: `/uploads/temp/${safeFilename}`,
      filename: safeFilename,
      size: input.size,
      key: `uploads/temp/${safeFilename}`,
    };
  }

  /**
   * Moves a file from uploads/temp/ to its permanent uploads/{type}/ directory.
   * Called by: UploadService.commitFile() after the DB record is committed.
   *
   * Flow:
   * 1. ensureDir(uploads/{type}/) — create the type subdirectory if absent.
   * 2. Build source path: uploads/temp/{filename}.
   * 3. Verify source exists; throw 404 ERR_FILE_NOT_FOUND if not.
   * 4. fs.renameSync(oldPath, newPath) — atomic on same-volume rename.
   * 5. Return StoredFile { url: '/uploads/{type}/{filename}', filename }.
   *
   * Note: fs.rename is atomic only when source and destination are on the same
   * filesystem partition. For cross-partition or networked volumes, replace with
   * a copy-then-unlink approach.
   *
   * @param filename - UUID filename returned by saveTemp().
   * @param type     - Target category slug (e.g. 'avatar', 'document').
   * @returns StoredFile with the permanent URL and filename.
   * @throws 404 ERR_FILE_NOT_FOUND — temp file is missing or already committed.
   */
  async commitToPermanent(filename: string, type: string): Promise<StoredFile> {
    const safeType = this.safeSegment(type);
    const safeFilename = path.basename(filename);
    const typeDir = path.join(this.baseDir, safeType);
    this.ensureDir(typeDir);

    const oldPath = path.join(this.tempDir, safeFilename);
    const newPath = path.join(typeDir, safeFilename);

    if (!fs.existsSync(oldPath)) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
    }

    const size = fs.statSync(oldPath).size;
    fs.renameSync(oldPath, newPath);

    const permanentUrl = `/uploads/${safeType}/${safeFilename}`;
    this.logger.log(`File committed to permanent storage: ${permanentUrl}`);

    return {
      url: permanentUrl,
      filename: safeFilename,
      size,
      key: `uploads/${safeType}/${safeFilename}`,
    };
  }

  /**
   * Deletes a file from the local filesystem by its relative URL.
   * Called by: UploadService.removeFile().
   *
   * Flow:
   * 1. Guard: empty fileUrl → return false immediately.
   * 2. Resolve relative URL to absolute path:
   *    - Starts with '/' → path.join(cwd, fileUrl) (API-relative URL).
   *    - Otherwise       → path.resolve(fileUrl)   (already absolute or CWD-relative).
   * 3. fs.existsSync() — return false if already gone (idempotent, caller decides on 404).
   * 4. fs.promises.unlink(filePath) — async delete.
   * 5. Return true on success; return false on caught error (never throws).
   *
   * @param fileUrl - Relative URL (e.g. /uploads/temp/abc.webp).
   * @returns true if deleted, false if file was not found or an error occurred.
   */
  async delete(fileUrl: string): Promise<boolean> {
    try {
      if (!fileUrl) return false;

      const filePath = this.resolveManagedPath(fileUrl);

      if (!fs.existsSync(filePath)) return false;

      await fs.promises.unlink(filePath);
      this.logger.log(`File deleted: ${filePath}`);
      return true;
    } catch (error) {
      this.logger.error(`Error deleting file "${fileUrl}": ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Purges stale files from uploads/temp/ that exceed the age threshold.
   * Called by: a scheduled CronJob / BullMQ recurring task (not yet wired).
   *
   * Flow:
   * 1. fs.readdirSync(uploads/temp/) — list all filenames.
   * 2. cutoff = now − olderThanHours × 3600 × 1000 ms.
   * 3. For each file: stat() → if mtimeMs < cutoff, unlinkSync and increment counter.
   * 4. Return the count of deleted files.
   *
   * Errors are caught and warned rather than thrown so a partial failure does not
   * crash the recurring job or prevent subsequent cleanup runs.
   *
   * @param olderThanHours - Age threshold in hours (default: 24).
   * @returns Number of files deleted.
   */
  async cleanupTemp(olderThanHours = 24): Promise<number> {
    let deleted = 0;
    try {
      const files = fs.readdirSync(this.tempDir);
      const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }
      this.logger.log(`Temp cleanup: deleted ${deleted} stale files`);
    } catch (error) {
      this.logger.warn(`Temp cleanup error: ${(error as Error).message}`);
    }
    return deleted;
  }

  private resolveManagedPath(fileUrl: string): string {
    const normalizedUrl = fileUrl.replace(/\\/g, '/').replace(/^\/+/, '');
    const withoutUploadsPrefix = normalizedUrl.startsWith('uploads/')
      ? normalizedUrl.slice('uploads/'.length)
      : normalizedUrl;
    const resolved = path.resolve(this.baseDir, withoutUploadsPrefix);

    if (!resolved.startsWith(this.baseDir)) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
    }

    return resolved;
  }

  private safeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
  }
}
