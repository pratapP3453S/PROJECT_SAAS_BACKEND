import { Injectable, Optional } from '@nestjs/common';
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
import { LocalSignedUrlService } from '../services/local-signed-url.service';
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
 * The local provider supports BOTH upload paths:
 *  1. Server-mediated  : POST /upload/:type        (Multer + processing pipeline)
 *  2. HMAC-presigned   : POST /upload/presigned-url → PUT /upload/local/direct
 *
 * Path 2 mirrors the cloud-provider contract bit-for-bit. The signed URL is a
 * bearer credential carrying {key, expire, contentType, maxSize}; the
 * `LocalDirectUploadController` verifies the signature, then this provider's
 * `writeDirectUpload()` lands the bytes under uploads/temp/<key>.
 *
 * `LocalSignedUrlService` is injected as @Optional() so the class still works
 * in unit tests / fixture builds where only the synchronous saveTemp/commit
 * surface matters and no signing is wired.
 */
@Injectable()
export class LocalStorageProvider
  extends BaseStorageProvider
  implements IPresignedUrlProvider
{
  private readonly baseDir: string;
  private readonly tempDir: string;

  constructor(
    private readonly uploadConfig: UploadConfigService,
    @Optional() private readonly signer?: LocalSignedUrlService,
  ) {
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

  /**
   * Promote a temp file to {UPLOAD_DEST}/{type}/{filename}.
   *
   * `tempIdentifier` is either:
   *   - a flat filename (server-mediated upload — leaf of /uploads/temp/...), OR
   *   - a full temp key like "uploads/temp/u-7/aadhar/abc.png" (presigned).
   *
   * Both forms collapse to the same permanent destination using only the leaf
   * filename, so a presigned aadhar upload at uploads/temp/u-7/aadhar/abc.png
   * lands at uploads/aadhar/abc.png — exactly the layout server-mediated
   * uploads produce.
   */
  async commitToPermanent(tempIdentifier: string, type: string): Promise<StoredFile> {
    const safeType = this.safeSegment(type);
    const safeFilename = path.basename(tempIdentifier);
    const typeDir = path.join(this.baseDir, safeType);
    this.ensureDir(typeDir);

    const oldPath = this.isFullKey(tempIdentifier)
      ? this.resolveManagedPath(tempIdentifier) // nested presigned key
      : path.join(this.tempDir, safeFilename); // flat server-mediated filename

    const newPath = path.join(typeDir, safeFilename);

    if (!fs.existsSync(oldPath)) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND, {
        details: `Temp file not found at ${path.relative(this.baseDir, oldPath)}.`,
      });
    }
    const size = fs.statSync(oldPath).size;
    fs.renameSync(oldPath, newPath);

    // Best-effort: prune now-empty parent directories under temp/ so cleanup
    // doesn't accumulate leftover scaffolding (uploads/temp/u-7/aadhar/).
    this.pruneEmptyParents(path.dirname(oldPath));

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

  /**
   * Recursive temp cleanup. Walks every file under {UPLOAD_DEST}/temp/ — both
   * the flat layout produced by server-mediated saveTemp (uploads/temp/abc.png)
   * AND the nested layout produced by presigned uploads
   * (uploads/temp/{userId}/{type}/abc.png). After unlinking stale files, prunes
   * any newly empty subdirectories so the temp tree doesn't accumulate
   * scaffolding.
   */
  async cleanupTemp(olderThanHours = 24): Promise<number> {
    let deleted = 0;
    try {
      const cutoff = Date.now() - olderThanHours * 3600 * 1000;
      deleted = this.cleanupTempRecursive(this.tempDir, cutoff);
      this.logSuccess(`Temp cleanup: deleted ${deleted} stale files`);
    } catch (error) {
      this.logger.warn(`Temp cleanup error: ${(error as Error).message}`);
    }
    return deleted;
  }

  private cleanupTempRecursive(dir: string, cutoffMs: number): number {
    let deleted = 0;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          deleted += this.cleanupTempRecursive(entryPath, cutoffMs);
          // Drop the directory if it became empty after pruning.
          try {
            if (fs.readdirSync(entryPath).length === 0 && entryPath !== this.tempDir) {
              fs.rmdirSync(entryPath);
            }
          } catch {
            /* concurrent writer; leave it */
          }
        } else if (entry.isFile()) {
          const stat = fs.statSync(entryPath);
          if (stat.mtimeMs < cutoffMs) {
            fs.unlinkSync(entryPath);
            deleted++;
          }
        }
      } catch (err) {
        this.logger.warn(
          `Skipping ${entryPath} during cleanup: ${(err as Error).message}`,
        );
      }
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

  // ─── IPresignedUrlProvider ────────────────────────────────────────────────

  async generateUploadUrl(
    fileKey: string,
    _uploadType: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    const method = (options.method ?? 'PUT') as 'PUT';

    // If the signer service is wired, return a real signed URL pointing at
    // PUT /upload/local/direct. Otherwise (rare — only in fixture builds) fall
    // back to the legacy api-proxy descriptor so existing callers keep working.
    if (this.signer) {
      const { url, expireAt } = this.signer.signUrl({
        method,
        key: fileKey,
        expireSeconds: expirySeconds,
        contentType: options.contentType,
        maxSizeBytes: options.maxSizeBytes,
      });
      return {
        url: this.publicUrl(url),
        method,
        expiresAt: expireAt,
        fileKey,
        headers: options.contentType ? { 'Content-Type': options.contentType } : undefined,
        providerData: {
          provider: 'local',
          mode: 'signed-url',
          note:
            'PUT the raw file body to this URL. The signature encodes key + expire + ' +
            'contentType + maxSize; tampering with any of those invalidates the request.',
        },
      };
    }

    // Legacy fallback (no signer wired)
    return {
      url: `/upload/${_uploadType}`,
      method: 'POST',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
      headers: { 'Content-Type': 'multipart/form-data' },
      providerData: {
        mode: 'api-proxy',
        fieldName: 'file',
        note: 'No signer wired; falling back to multipart API-proxy upload.',
      },
    };
  }

  async generateDownloadUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;

    if (this.signer) {
      const { url, expireAt } = this.signer.signUrl({
        method: 'GET',
        key: fileKey,
        expireSeconds: expirySeconds,
      });
      return {
        url: this.publicUrl(url),
        method: 'GET',
        expiresAt: expireAt,
        fileKey,
      };
    }

    // Legacy: return the static-file URL. Static serving in main.ts means the
    // file is publicly addressable by anyone who knows the path; only safe for
    // public types (e.g. avatar). For private types you MUST configure the
    // signer (set UPLOAD_LOCAL_SIGNING_SECRET).
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
    // We deliberately do NOT issue a signed DELETE. Local mode routes deletes
    // through DELETE /upload/remove which already requires JWT auth. Exposing
    // a signed-URL DELETE would let any URL holder destroy files.
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    return {
      url: '/upload/remove',
      method: 'DELETE',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
      providerData: {
        mode: 'api-proxy',
        body: { fileUrl: fileKey },
        note: 'Local provider routes DELETE through the authenticated /upload/remove endpoint.',
      },
    };
  }

  async completePresignedUpload(input: PresignedCompleteInput): Promise<PresignedCompleteResult> {
    const head = await this.head(input.fileKey);
    if (!head.exists) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND, {
        details:
          'No file found at the provided key. Did the PUT against the signed URL succeed?',
      });
    }
    if (input.expectedSize && Math.abs(head.size - input.expectedSize) > 1024) {
      throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
        details: `Size mismatch: expected ${input.expectedSize}, found ${head.size}.`,
      });
    }
    return {
      exists: true,
      size: head.size,
      url: this.publicUrl(`/${input.fileKey.replace(/^\/+/, '')}`),
      fileKey: input.fileKey,
    };
  }

  // ─── Direct upload/download (called by LocalDirectUploadController) ───────

  /**
   * Land raw bytes at `key` under {UPLOAD_DEST}. The key must already be a
   * temp-prefixed key (uploads/temp/...), enforced by `assertWritableKey()`.
   */
  async writeDirectUpload(
    key: string,
    buffer: Buffer,
    expectedContentType?: string,
  ): Promise<StoredFile> {
    this.assertWritableKey(key);

    const filePath = this.resolveManagedPath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);

    this.logSuccess(`Direct upload landed: ${filePath} (${buffer.length} bytes)`);
    return {
      url: this.publicUrl(`/${key.replace(/^\/+/, '')}`),
      filename: path.basename(filePath),
      size: buffer.length,
      key,
      mimeType: expectedContentType,
    };
  }

  /**
   * Resolve `key` (must live under baseDir) to an absolute path for streaming
   * by the controller. Returns null if the file doesn't exist.
   */
  resolveDownloadPath(key: string): { absolutePath: string; size: number } | null {
    let abs: string;
    try {
      abs = this.resolveManagedPath(key);
    } catch {
      return null;
    }
    if (!fs.existsSync(abs)) return null;
    const stat = fs.statSync(abs);
    if (!stat.isFile()) return null;
    return { absolutePath: abs, size: stat.size };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * Heuristic: a "full key" contains a path separator — that means it was
   * produced by buildUploadKey (presigned flow). A bare leaf filename is the
   * server-mediated form. Both forms are accepted by commitToPermanent().
   */
  private isFullKey(tempIdentifier: string): boolean {
    const normalised = tempIdentifier.replace(/\\/g, '/');
    return normalised.includes('/');
  }

  /**
   * Walk upward from `dir` removing empty directories until we hit baseDir or
   * a non-empty directory. Used after a presigned commit to clean up the
   * userId/type scaffolding (uploads/temp/u-7/aadhar/) that's no longer needed.
   */
  private pruneEmptyParents(dir: string): void {
    let current = path.resolve(dir);
    while (current.startsWith(this.tempDir) && current !== this.tempDir) {
      try {
        if (fs.readdirSync(current).length > 0) return;
        fs.rmdirSync(current);
      } catch {
        return; // directory busy or already gone — stop
      }
      current = path.dirname(current);
    }
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

  /**
   * Refuse to land a direct upload anywhere except uploads/temp/. The two-stage
   * commit semantics depend on direct uploads always staging in temp/ first;
   * letting a signed URL write straight into uploads/avatar/ would bypass the
   * `commit` audit trail and the temp-cleanup safety net.
   */
  private assertWritableKey(key: string): void {
    const normalised = key.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    if (!normalised.startsWith('uploads/temp/')) {
      throw ApiError.fromDefinition(Errors.FORBIDDEN, {
        details: 'Direct uploads may only target keys under uploads/temp/.',
      });
    }
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
