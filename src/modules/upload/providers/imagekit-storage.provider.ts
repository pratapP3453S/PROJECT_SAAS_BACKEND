import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
// imagekit's TS types don't fully cover the runtime API; use a relaxed import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ImageKit = require('imagekit');
import { Errors } from '../../../common/constants/error.constants';
import { ApiError } from '../../../common/errors/api.error';
import { UploadConfigService } from '../config/upload-config.service';
import { ImageKitProviderConfig } from '../config/upload-config.interface';
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
 * ImageKitStorageProvider — uses ImageKit as media store + CDN.
 *
 * ImageKit addresses files by `fileId` (server-side) or by relative path.
 * Mapping
 *   folder (temp)        : /{folder}/temp/{uploadType}
 *   folder (permanent)   : /{folder}/{uploadType}
 *   filePath returned    : "{folder}/temp/{uploadType}/{filename}"
 *
 * The Node SDK does NOT expose a "rename file" API for moving between folders,
 * so commit is implemented as: download bytes → re-upload to permanent folder
 * → delete the temp original. This keeps the contract identical to S3/Local.
 *
 * Direct upload (presigned)
 *   ImageKit's browser SDK uses HMAC-SHA1(privateKey, token + expire) as the
 *   signature. We compute that server-side and return:
 *     url    : https://upload.imagekit.io/api/v1/files/upload
 *     formData: { token, expire, signature, publicKey, fileName, folder }
 *   The browser POSTs as multipart/form-data with the file appended.
 */
@Injectable()
export class ImageKitStorageProvider
  extends BaseStorageProvider
  implements IPresignedUrlProvider
{
  private readonly cfg: ImageKitProviderConfig;
  private readonly client: any;

  constructor(private readonly uploadConfig: UploadConfigService) {
    super('ImageKit');
    const cfg = uploadConfig.getConfig().imagekit;
    if (!cfg) throw new Error('ImageKitStorageProvider: imagekit configuration missing.');
    this.cfg = cfg;
    this.client = new ImageKit({
      publicKey: cfg.publicKey,
      privateKey: cfg.privateKey,
      urlEndpoint: cfg.urlEndpoint,
    });
  }

  // ─── IStorageProvider ─────────────────────────────────────────────────────

  async saveTemp(input: SaveFileInput): Promise<StoredFile> {
    const safeFilename = this.extractFilename(input.filename);
    const folder = this.tempFolder(input.uploadType);

    const result = await this.client.upload({
      file: input.buffer,
      fileName: safeFilename,
      folder,
      useUniqueFileName: false,
      isPrivateFile: input.isEncrypted,
      tags: input.uploadType ? [input.uploadType] : undefined,
      customMetadata: input.metadata,
    });

    this.logSuccess(`Saved to temp: ${result.filePath}`);
    return {
      url: result.url,
      filename: result.name,
      size: result.size,
      key: result.filePath, // keep filePath as the storage key
      mimeType: result.fileType ? this.mimeFromFileType(result.fileType, result.name) : undefined,
    };
  }

  /**
   * Promote a temp file to /{folder}/{type}/{filename}.
   *
   * `tempIdentifier` may be a flat filename (server-mediated → look up under
   * /{folder}/temp/{type}/) OR a full temp filePath like
   * "/uploads/temp/u-7/aadhar/abc.png" (presigned → look up under that exact
   * folder). Either way the destination is /{folder}/{type}/{filename}.
   */
  async commitToPermanent(tempIdentifier: string, type: string): Promise<StoredFile> {
    const safeType = this.safeSegment(type);
    const safeFilename = this.extractFilename(tempIdentifier);
    const tempLookupFolder = tempIdentifier.includes('/')
      ? this.parentFolder(tempIdentifier) // presigned: use the actual parent
      : this.tempFolder(safeType); // server-mediated: use the registry folder
    const tempPath = `${tempLookupFolder}/${safeFilename}`;
    const permanentFolder = this.permanentFolder(safeType);

    // 1. Look up the source file by path
    const list = await this.client.listFiles({
      path: tempLookupFolder,
      name: safeFilename,
      limit: 1,
    });
    if (!list || list.length === 0) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
    }
    const source = list[0];

    // 2. Re-upload the bytes into the permanent folder
    const buffer = await this.fetchBuffer(source.url);
    const reuploaded = await this.client.upload({
      file: buffer,
      fileName: safeFilename,
      folder: permanentFolder,
      useUniqueFileName: false,
      isPrivateFile: source.isPrivateFile,
      tags: source.tags,
      customMetadata: source.customMetadata,
    });

    // 3. Delete the temp original
    await this.client.deleteFile(source.fileId).catch((err: Error) =>
      this.logger.warn(`Temp delete after commit failed for ${tempPath}: ${err.message}`),
    );

    this.logSuccess(`Committed: ${reuploaded.filePath}`);
    return {
      url: reuploaded.url,
      filename: reuploaded.name,
      size: reuploaded.size,
      key: reuploaded.filePath,
      mimeType: reuploaded.fileType
        ? this.mimeFromFileType(reuploaded.fileType, reuploaded.name)
        : undefined,
    };
  }

  async delete(fileUrl: string): Promise<boolean> {
    if (!fileUrl) return false;
    try {
      const filePath = this.urlToPath(fileUrl);
      // ImageKit needs a fileId, so we look it up first.
      const folder = filePath.substring(0, filePath.lastIndexOf('/'));
      const name = filePath.substring(filePath.lastIndexOf('/') + 1);
      const matches = await this.client.listFiles({ path: folder, name, limit: 1 });
      if (!matches || matches.length === 0) return false;
      await this.client.deleteFile(matches[0].fileId);
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
      const cutoff = Date.now() - olderThanHours * 3600 * 1000;
      let skip = 0;
      const pageSize = 100;
      while (true) {
        const list = await this.client.listFiles({
          path: this.tempFolder(),
          limit: pageSize,
          skip,
        });
        if (!list || list.length === 0) break;
        for (const f of list) {
          const created = f.createdAt ? new Date(f.createdAt).getTime() : 0;
          if (created < cutoff) {
            await this.client.deleteFile(f.fileId);
            deleted++;
          }
        }
        if (list.length < pageSize) break;
        skip += pageSize;
      }
      this.logSuccess(`Temp cleanup: deleted ${deleted} files`);
    } catch (error) {
      this.logger.warn(`Temp cleanup error: ${(error as Error).message}`);
    }
    return deleted;
  }

  async head(fileKey: string): Promise<ObjectHead> {
    try {
      const folder = fileKey.substring(0, fileKey.lastIndexOf('/'));
      const name = fileKey.substring(fileKey.lastIndexOf('/') + 1);
      const matches = await this.client.listFiles({ path: folder, name, limit: 1 });
      if (!matches || matches.length === 0) return { exists: false, size: 0 };
      const f = matches[0];
      return {
        exists: true,
        size: f.size,
        mimeType: f.fileType ? this.mimeFromFileType(f.fileType, f.name) : undefined,
        lastModified: f.createdAt ? new Date(f.createdAt) : undefined,
      };
    } catch (error) {
      this.logger.warn(`head failed: ${(error as Error).message}`);
      return { exists: false, size: 0 };
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
    const expire = this.expiresAt(expirySeconds);
    const token = crypto.randomUUID();
    const signature = crypto
      .createHmac('sha1', this.cfg.privateKey)
      .update(token + expire)
      .digest('hex');

    const folder = this.tempFolder(uploadType);
    const fileName = this.extractFilename(fileKey);

    return {
      url: 'https://upload.imagekit.io/api/v1/files/upload',
      method: 'POST',
      expiresAt: expire,
      fileKey: `${folder}/${fileName}`,
      formData: {
        token,
        expire: String(expire),
        signature,
        publicKey: this.cfg.publicKey,
        fileName,
        folder,
        useUniqueFileName: this.cfg.useUniqueFileName ? 'true' : 'false',
      },
      providerData: { provider: 'imagekit' },
    };
  }

  async generateDownloadUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds =
      options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    const expire = this.expiresAt(expirySeconds);
    const url = this.client.url({
      path: fileKey,
      signed: true,
      expireSeconds: expirySeconds,
    });
    return { url, method: 'GET', expiresAt: expire, fileKey };
  }

  async generateDeleteUrl(): Promise<PresignedUrlResult> {
    throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
      details:
        'ImageKit does not support presigned DELETE. Use DELETE /upload/remove (server-side admin API).',
    });
  }

  async completePresignedUpload(input: PresignedCompleteInput): Promise<PresignedCompleteResult> {
    const head = await this.head(input.fileKey);
    if (!head.exists) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND, {
        details: `ImageKit file not found at ${input.fileKey}.`,
      });
    }
    if (input.expectedSize && Math.abs(head.size - input.expectedSize) > 4096) {
      throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
        details: `Size mismatch: expected ${input.expectedSize}, got ${head.size}.`,
      });
    }
    return {
      exists: true,
      size: head.size,
      contentType: head.mimeType,
      url: `${this.cfg.urlEndpoint.replace(/\/+$/, '')}/${input.fileKey.replace(/^\/+/, '')}`,
      fileKey: input.fileKey,
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Extract the leading-slash parent folder of a full filePath.
   * "/uploads/temp/u-7/aadhar/abc.png" → "/uploads/temp/u-7/aadhar"
   */
  private parentFolder(fullPath: string): string {
    const normalised = fullPath.replace(/\\/g, '/').replace(/^\/?/, '/');
    const slash = normalised.lastIndexOf('/');
    if (slash <= 0) return '/';
    return normalised.substring(0, slash);
  }

  private tempFolder(uploadType?: string): string {
    const t = uploadType ? this.safeSegment(uploadType) : '';
    const path = `/${this.normalizePath(`${this.cfg.folder}/temp/${t}`)}`;
    return path.replace(/\/+$/, '');
  }

  private permanentFolder(uploadType: string): string {
    return `/${this.normalizePath(`${this.cfg.folder}/${this.safeSegment(uploadType)}`)}`;
  }

  private urlToPath(input: string): string {
    if (!/^https?:/i.test(input)) return input.startsWith('/') ? input : `/${input}`;
    try {
      const u = new URL(input);
      return u.pathname; // ImageKit URLs are <urlEndpoint>/<path>
    } catch {
      return input;
    }
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`);
    }
    const arr = new Uint8Array(await res.arrayBuffer());
    return Buffer.from(arr);
  }

  private mimeFromFileType(type: string, fileName: string): string {
    // ImageKit reports 'image' / 'non-image' rather than a MIME — derive from ext.
    const ext = fileName.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
    };
    return map[ext ?? ''] ?? (type === 'image' ? 'image/jpeg' : 'application/octet-stream');
  }

  private expiresAt(expirySeconds: number): number {
    return Math.floor((Date.now() + expirySeconds * 1000) / 1000);
  }
}
