import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { v2 as cloudinary, UploadApiResponse, UploadApiOptions } from 'cloudinary';
import { Errors } from '../../../common/constants/error.constants';
import { ApiError } from '../../../common/errors/api.error';
import { UploadConfigService } from '../config/upload-config.service';
import { CloudinaryProviderConfig } from '../config/upload-config.interface';
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
 * CloudinaryStorageProvider — uses Cloudinary as media store + CDN.
 *
 * Cloudinary is NOT an object store; objects are addressed by `public_id`.
 * Mapping:
 *   public_id (temp)       : {folder}/temp/{uploadType}/{uuid-name-without-ext}
 *   public_id (permanent)  : {folder}/{uploadType}/{uuid-name-without-ext}
 *   filename returned      : "{public_id-base}.{format}"
 *
 * "Commit" is implemented as cloudinary.uploader.rename (atomic on their side).
 *
 * Direct upload (presigned)
 *   Cloudinary doesn't issue an HTTP PUT URL. Instead it expects a POST with a
 *   signature. We return:
 *     url      : https://api.cloudinary.com/v1_1/{cloud}/{resource_type}/upload
 *     formData : { public_id, timestamp, signature, api_key, folder, ... }
 *   The browser submits as multipart/form-data including the file.
 */
@Injectable()
export class CloudinaryStorageProvider
  extends BaseStorageProvider
  implements IPresignedUrlProvider
{
  private readonly cfg: CloudinaryProviderConfig;

  constructor(private readonly uploadConfig: UploadConfigService) {
    super('Cloudinary');
    const cfg = uploadConfig.getConfig().cloudinary;
    if (!cfg) throw new Error('CloudinaryStorageProvider: cloudinary configuration missing.');
    this.cfg = cfg;

    if (cfg.cloudinaryUrl) {
      // CLOUDINARY_URL is auto-detected by the SDK from process.env, but we set
      // it explicitly to avoid relying on env state.
      cloudinary.config({ cloudinary_url: cfg.cloudinaryUrl, secure: cfg.secure });
    } else {
      cloudinary.config({
        cloud_name: cfg.cloudName,
        api_key: cfg.apiKey,
        api_secret: cfg.apiSecret,
        secure: cfg.secure,
      });
    }
  }

  // ─── IStorageProvider ─────────────────────────────────────────────────────

  async saveTemp(input: SaveFileInput): Promise<StoredFile> {
    const safeFilename = this.extractFilename(input.filename);
    const publicIdBase = this.stripExt(safeFilename);
    const folder = this.tempFolder(input.uploadType);

    const result = await this.uploadBuffer(input.buffer, {
      public_id: publicIdBase,
      folder,
      resource_type: 'auto',
      overwrite: true,
      use_filename: false,
      unique_filename: false,
      context: {
        isEncrypted: String(input.isEncrypted),
        uploadType: input.uploadType ?? '',
        ...(input.metadata ?? {}),
      },
    });

    this.logSuccess(`Saved to temp: ${result.public_id}`);
    return {
      url: result.secure_url ?? result.url,
      filename: this.filenameFromPublicId(result.public_id, result.format),
      size: result.bytes,
      key: result.public_id,
      mimeType: this.mimeFromFormat(result.format, result.resource_type),
    };
  }

  async commitToPermanent(filename: string, type: string): Promise<StoredFile> {
    const safeType = this.safeSegment(type);
    const safeFilename = this.extractFilename(filename);
    const fromPublicId = `${this.tempFolder(safeType)}/${this.stripExt(safeFilename)}`;
    const toPublicId = `${this.permanentFolder(safeType)}/${this.stripExt(safeFilename)}`;

    try {
      const result = await cloudinary.uploader.rename(fromPublicId, toPublicId, {
        resource_type: 'auto',
        overwrite: true,
        invalidate: true,
      });
      this.logSuccess(`Committed: ${result.public_id}`);
      return {
        url: result.secure_url ?? result.url,
        filename: this.filenameFromPublicId(result.public_id, result.format),
        size: result.bytes,
        key: result.public_id,
        mimeType: this.mimeFromFormat(result.format, result.resource_type),
      };
    } catch (error) {
      const err = error as { http_code?: number; message?: string };
      if (err.http_code === 404) {
        throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
      }
      throw error;
    }
  }

  async delete(fileUrl: string): Promise<boolean> {
    if (!fileUrl) return false;
    try {
      const publicId = this.urlOrKeyToPublicId(fileUrl);
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        invalidate: true,
      });
      // Cloudinary returns "ok" / "not found"
      if (result.result === 'not found') return false;
      this.logSuccess(`Deleted: ${publicId}`);
      return result.result === 'ok';
    } catch (error) {
      this.logError('delete', error as Error);
      return false;
    }
  }

  async cleanupTemp(olderThanHours = 24): Promise<number> {
    let deleted = 0;
    try {
      const cutoff = Date.now() - olderThanHours * 3600 * 1000;
      const tempPrefix = `${this.cfg.folder}/temp/`;
      let nextCursor: string | undefined;
      do {
        const list = await cloudinary.api.resources({
          type: 'upload',
          prefix: tempPrefix,
          max_results: 100,
          next_cursor: nextCursor,
        });
        const stale = (list.resources ?? []).filter(
          (r: { public_id: string; created_at: string }) =>
            new Date(r.created_at).getTime() < cutoff,
        );
        for (const r of stale) {
          await cloudinary.uploader.destroy(r.public_id, { invalidate: true });
          deleted++;
        }
        nextCursor = list.next_cursor;
      } while (nextCursor);
      this.logSuccess(`Temp cleanup: deleted ${deleted} resources`);
    } catch (error) {
      this.logger.warn(`Temp cleanup error: ${(error as Error).message}`);
    }
    return deleted;
  }

  async head(fileKey: string): Promise<ObjectHead> {
    try {
      const r = await cloudinary.api.resource(fileKey);
      return {
        exists: true,
        size: r.bytes,
        mimeType: this.mimeFromFormat(r.format, r.resource_type),
        etag: r.etag,
        lastModified: r.created_at ? new Date(r.created_at) : undefined,
      };
    } catch (error) {
      const err = error as { http_code?: number };
      if (err.http_code === 404) return { exists: false, size: 0 };
      throw error;
    }
  }

  // ─── IPresignedUrlProvider ────────────────────────────────────────────────

  async generateUploadUrl(
    fileKey: string,
    uploadType: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = this.tempFolder(uploadType);

    const paramsToSign: Record<string, string | number> = {
      public_id: this.stripExt(this.extractFilename(fileKey)),
      folder,
      timestamp,
    };
    if (this.cfg.uploadPreset) paramsToSign.upload_preset = this.cfg.uploadPreset;

    const signature = cloudinary.utils.api_sign_request(paramsToSign, this.cfg.apiSecret);

    return {
      url: `https://api.cloudinary.com/v1_1/${this.cfg.cloudName}/auto/upload`,
      method: 'POST',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey: `${folder}/${paramsToSign.public_id}`,
      formData: {
        ...Object.fromEntries(Object.entries(paramsToSign).map(([k, v]) => [k, String(v)])),
        signature,
        api_key: this.cfg.apiKey,
      },
      providerData: { provider: 'cloudinary', resourceType: 'auto' },
    };
  }

  async generateDownloadUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    const url = cloudinary.utils.private_download_url(fileKey, 'auto', {
      expires_at: this.expiresAt(expirySeconds),
    });
    return {
      url,
      method: 'GET',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
    };
  }

  async generateDeleteUrl(): Promise<PresignedUrlResult> {
    throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
      details:
        'Cloudinary does not support presigned DELETE. Call DELETE /upload/remove and the server will use the admin API.',
    });
  }

  async completePresignedUpload(input: PresignedCompleteInput): Promise<PresignedCompleteResult> {
    const head = await this.head(input.fileKey);
    if (!head.exists) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND, {
        details: `Cloudinary resource ${input.fileKey} not found.`,
      });
    }
    if (input.expectedSize && Math.abs(head.size - input.expectedSize) > 4096) {
      // Cloudinary may transcode; allow 4 KB tolerance.
      throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
        details: `Size mismatch: expected ${input.expectedSize}, got ${head.size}.`,
      });
    }
    return {
      exists: true,
      size: head.size,
      contentType: head.mimeType,
      url: cloudinary.url(input.fileKey, { secure: this.cfg.secure }),
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private uploadBuffer(buffer: Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
        if (err || !result) return reject(err ?? new Error('Cloudinary returned no result'));
        resolve(result);
      });
      stream.end(buffer);
    });
  }

  private tempFolder(uploadType?: string): string {
    const t = uploadType ? this.safeSegment(uploadType) : '';
    return this.normalizePath(`${this.cfg.folder}/temp/${t}`);
  }

  private permanentFolder(uploadType: string): string {
    return this.normalizePath(`${this.cfg.folder}/${this.safeSegment(uploadType)}`);
  }

  private filenameFromPublicId(publicId: string, format?: string): string {
    const name = publicId.split('/').pop() ?? publicId;
    return format ? `${name}.${format}` : name;
  }

  private stripExt(filename: string): string {
    const i = filename.lastIndexOf('.');
    return i === -1 ? filename : filename.slice(0, i);
  }

  private mimeFromFormat(format?: string, resourceType?: string): string {
    if (!format) return 'application/octet-stream';
    if (resourceType === 'video') return `video/${format}`;
    if (resourceType === 'raw') return 'application/octet-stream';
    return `image/${format}`;
  }

  private urlOrKeyToPublicId(input: string): string {
    // Accept secure_url, url, or raw public_id
    if (!/^https?:/i.test(input)) return input.replace(/^\/+/, '');
    try {
      const u = new URL(input);
      // Cloudinary URL pattern: /<cloud_name>/<resource_type>/upload/v<version>/<public_id>.<ext>
      const parts = u.pathname.split('/').filter(Boolean);
      const uploadIdx = parts.indexOf('upload');
      if (uploadIdx === -1) return input.replace(/^\/+/, '');
      const tail = parts.slice(uploadIdx + 1).join('/');
      const noVersion = tail.replace(/^v\d+\//, '');
      return this.stripExt(noVersion);
    } catch {
      return input.replace(/^\/+/, '');
    }
  }

  private expiresAt(expirySeconds: number): number {
    return Math.floor((Date.now() + expirySeconds * 1000) / 1000);
  }
}
