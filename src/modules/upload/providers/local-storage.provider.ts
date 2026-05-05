import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Errors } from '../../../common/constants/error.constants';
import { ApiError } from '../../../common/errors/api.error';
import { UploadConfigService } from '../config/upload-config.service';
import {
  IPresignedUrlProvider,
  PresignedCompleteInput,
  PresignedCompleteResult,
  PresignedUrlOptions,
  PresignedUrlResult,
} from '../interfaces/presigned-url.interface';
import {
  ObjectHead,
  SaveFileInput,
  StoredFile,
} from '../interfaces/storage-provider.interface';
import { BaseStorageProvider } from './base-storage.provider';

/**
 * LocalStorageProvider — IStorageProvider on the local filesystem.
 *
 * Layout (relative to process.cwd()):
 *   {UPLOAD_DEST}/
 *     temp/        ← saveTemp() writes here
 *     {type}/      ← commitToPermanent() moves the processed file here
 *
 * Public URLs (relative to API root):
 *   Temp       /uploads/temp/{filename}
 *   Permanent  /uploads/{type}/{filename}
 *
 * Implements IPresignedUrlProvider for symmetry. Local mode returns an
 * "API-proxy" descriptor — the client uses POST /upload/{type} as if it were
 * the signed URL.
 */
@Injectable()
export class LocalStorageProvider
  extends BaseStorageProvider
  implements IPresignedUrlProvider
{
  private readonly baseDir: string;
  private readonly tempDir: string;

  constructor(private readonly uploadConfig: UploadConfigService) {
    super('Local');
    this.baseDir = path.resolve(process.cwd(), uploadConfig.getConfig().localStoragePath);
    this.tempDir = path.join(this.baseDir, 'temp');
    this.ensureDir(this.baseDir);
    this.ensureDir(this.tempDir);
  }

  // ─── IStorageProvider ─────────────────────────────────────────────────────

  async saveTemp(input: SaveFileInput): Promise<StoredFile> {
    this.ensureDir(this.tempDir);
    const safeFilename = path.basename(input.filename);
    const destPath = path.join(this.tempDir, safeFilename);
    fs.writeFileSync(destPath, input.buffer);
    this.logSuccess(`Saved to temp: ${safeFilename}`);
    return {
      url: this.publicUrl(`/uploads/temp/${safeFilename}`),
      filename: safeFilename,
      size: input.size,
      key: `uploads/temp/${safeFilename}`,
      mimeType: input.mimeType,
    };
  }

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

    const url = this.publicUrl(`/uploads/${safeType}/${safeFilename}`);
    this.logSuccess(`Committed: ${url}`);
    return {
      url,
      filename: safeFilename,
      size,
      key: `uploads/${safeType}/${safeFilename}`,
    };
  }

  async delete(fileUrl: string): Promise<boolean> {
    try {
      if (!fileUrl) return false;
      const filePath = this.resolveManagedPath(fileUrl);
      if (!fs.existsSync(filePath)) return false;
      await fs.promises.unlink(filePath);
      this.logSuccess(`Deleted: ${filePath}`);
      return true;
    } catch (error) {
      this.logError('delete', error as Error);
      return false;
    }
  }

  async cleanupTemp(olderThanHours = 24): Promise<number> {
    let deleted = 0;
    try {
      const files = fs.readdirSync(this.tempDir);
      const cutoff = Date.now() - olderThanHours * 3600 * 1000;
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }
      this.logSuccess(`Temp cleanup: deleted ${deleted} stale files`);
    } catch (error) {
      this.logger.warn(`Temp cleanup error: ${(error as Error).message}`);
    }
    return deleted;
  }

  async head(fileKey: string): Promise<ObjectHead> {
    try {
      const filePath = this.resolveManagedPath(fileKey);
      if (!fs.existsSync(filePath)) return { exists: false, size: 0 };
      const stat = fs.statSync(filePath);
      return {
        exists: true,
        size: stat.size,
        lastModified: stat.mtime,
      };
    } catch {
      return { exists: false, size: 0 };
    }
  }

  // ─── IPresignedUrlProvider (API-proxy mode) ───────────────────────────────

  async generateUploadUrl(
    fileKey: string,
    uploadType: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    return {
      url: `/upload/${uploadType}`,
      method: 'POST',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
      headers: { 'Content-Type': 'multipart/form-data' },
      providerData: {
        mode: 'api-proxy',
        fieldName: 'file',
        note: 'Local storage uses the API upload endpoint instead of a signed object-store URL.',
      },
    };
  }

  async generateDownloadUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    const url = fileKey.startsWith('/') ? fileKey : `/${fileKey}`;
    return {
      url: this.publicUrl(url),
      method: 'GET',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
    };
  }

  async generateDeleteUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    return {
      url: '/upload/remove',
      method: 'DELETE',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
      providerData: { mode: 'api-proxy', body: { fileUrl: fileKey } },
    };
  }

  async completePresignedUpload(input: PresignedCompleteInput): Promise<PresignedCompleteResult> {
    const head = await this.head(input.fileKey);
    if (!head.exists) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND, {
        details: 'No file found at the provided key. Use POST /upload/:type for local mode.',
      });
    }
    return {
      exists: true,
      size: head.size,
      url: this.publicUrl(`/${input.fileKey.replace(/^\/+/, '')}`),
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

  private publicUrl(relativeUrl: string): string {
    const base = this.uploadConfig.getConfig().publicBaseUrl;
    if (!base) return relativeUrl;
    return `${base.replace(/\/+$/, '')}${relativeUrl}`;
  }

  private expiresAt(expirySeconds: number): number {
    return Math.floor((Date.now() + expirySeconds * 1000) / 1000);
  }
}
