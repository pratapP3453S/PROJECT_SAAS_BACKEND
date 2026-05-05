import { Injectable } from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Errors } from '../../../common/constants/error.constants';
import { ApiError } from '../../../common/errors/api.error';
import { UploadConfigService } from '../config/upload-config.service';
import { S3ProviderConfig } from '../config/upload-config.interface';
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
 * S3StorageProvider — full AWS S3 (and S3-compatible) implementation.
 *
 * Implements both:
 *  - IStorageProvider          : server-side I/O (saveTemp, commit, delete, head, cleanup).
 *  - IPresignedUrlProvider     : direct browser ↔ S3 PUT/GET signed URLs.
 *
 * Object key layout
 *  Temp       : {tempPrefix}/{uploadType?}/{filename}
 *  Permanent  : {permanentPrefix}/{uploadType}/{filename}
 *
 * Returned URL
 *  - When AWS_S3_PUBLIC_URL is set, use it as the host (CDN/CloudFront).
 *  - Otherwise build a virtual-hosted style URL: https://{bucket}.s3.{region}.amazonaws.com/{key}
 *  - When AWS_S3_FORCE_PATH_STYLE=true, switch to https://{endpoint}/{bucket}/{key}.
 */
@Injectable()
export class S3StorageProvider
  extends BaseStorageProvider
  implements IPresignedUrlProvider
{
  protected readonly client: S3Client;
  protected readonly cfg: S3ProviderConfig;

  constructor(protected readonly uploadConfig: UploadConfigService) {
    super('S3');
    const cfg = uploadConfig.getConfig().s3;
    if (!cfg) {
      throw new Error('S3StorageProvider: AWS S3 configuration block is missing.');
    }
    this.cfg = cfg;
    this.client = this.buildClient(cfg);
  }

  protected buildClient(cfg: S3ProviderConfig): S3Client {
    return new S3Client({
      region: cfg.region,
      credentials: cfg.accessKeyId
        ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
        : undefined, // fall back to instance/role credentials
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      maxAttempts: cfg.maxRetries ?? 3,
    });
  }

  // ─── IStorageProvider ─────────────────────────────────────────────────────

  async saveTemp(input: SaveFileInput): Promise<StoredFile> {
    const safeFilename = this.extractFilename(input.filename);
    const key = this.buildTempKey(input.uploadType, safeFilename);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
        Metadata: this.flattenMetadata({
          isEncrypted: String(input.isEncrypted),
          uploadType: input.uploadType ?? '',
          ...input.metadata,
        }),
      }),
    );

    this.logSuccess(`Saved to temp: s3://${this.cfg.bucket}/${key}`);
    return {
      url: this.buildPublicUrl(key),
      filename: safeFilename,
      size: input.size,
      key,
      mimeType: input.mimeType,
    };
  }

  async commitToPermanent(filename: string, type: string): Promise<StoredFile> {
    const safeType = this.safeSegment(type);
    const safeFilename = this.extractFilename(filename);
    const tempKey = this.buildTempKey(safeType, safeFilename);
    const permanentKey = this.buildPermanentKey(safeType, safeFilename);

    // Verify temp object exists.
    const head = await this.head(tempKey);
    if (!head.exists) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
    }

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.cfg.bucket,
        Key: permanentKey,
        CopySource: encodeURIComponent(`${this.cfg.bucket}/${tempKey}`),
        MetadataDirective: 'COPY',
      }),
    );

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: tempKey }),
    );

    this.logSuccess(`Committed: s3://${this.cfg.bucket}/${permanentKey}`);
    return {
      url: this.buildPublicUrl(permanentKey),
      filename: safeFilename,
      size: head.size,
      key: permanentKey,
      mimeType: head.mimeType,
    };
  }

  async delete(fileUrl: string): Promise<boolean> {
    if (!fileUrl) return false;
    try {
      const key = this.urlToKey(fileUrl);
      const head = await this.head(key);
      if (!head.exists) return false;
      await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      this.logSuccess(`Deleted: s3://${this.cfg.bucket}/${key}`);
      return true;
    } catch (error) {
      this.logError('delete', error as Error);
      return false;
    }
  }

  async cleanupTemp(olderThanHours = 24): Promise<number> {
    let deleted = 0;
    try {
      const cutoffMs = Date.now() - olderThanHours * 3600 * 1000;
      let continuationToken: string | undefined;
      do {
        const list = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.cfg.bucket,
            Prefix: `${this.cfg.tempPrefix}/`,
            ContinuationToken: continuationToken,
          }),
        );
        const stale = (list.Contents ?? []).filter(
          (obj) => obj.Key && obj.LastModified && obj.LastModified.getTime() < cutoffMs,
        );
        if (stale.length > 0) {
          await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.cfg.bucket,
              Delete: { Objects: stale.map((obj) => ({ Key: obj.Key! })) },
            }),
          );
          deleted += stale.length;
        }
        continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
      } while (continuationToken);
      this.logSuccess(`Temp cleanup: deleted ${deleted} stale objects`);
    } catch (error) {
      this.logger.warn(`Temp cleanup error: ${(error as Error).message}`);
    }
    return deleted;
  }

  async head(fileKey: string): Promise<ObjectHead> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: fileKey }),
      );
      return {
        exists: true,
        size: Number(out.ContentLength ?? 0),
        mimeType: out.ContentType,
        etag: out.ETag,
        lastModified: out.LastModified,
        metadata: out.Metadata,
      };
    } catch (error) {
      const code = (error as { name?: string; $metadata?: { httpStatusCode?: number } });
      if (code.name === 'NotFound' || code.$metadata?.httpStatusCode === 404) {
        return { exists: false, size: 0 };
      }
      throw error;
    }
  }

  // ─── IPresignedUrlProvider ────────────────────────────────────────────────

  async generateUploadUrl(
    fileKey: string,
    _uploadType: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds = options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    const method = options.method ?? 'PUT';
    const command = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: fileKey,
      ContentType: options.contentType,
      ContentLength: options.maxSizeBytes,
      Metadata: options.metadata ? this.flattenMetadata(options.metadata) : undefined,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: expirySeconds });

    const headers: Record<string, string> = {};
    if (options.contentType) headers['Content-Type'] = options.contentType;

    return {
      url,
      method,
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
      headers,
      providerData: { bucket: this.cfg.bucket, region: this.cfg.region },
    };
  }

  async generateDownloadUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds = options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: fileKey }),
      { expiresIn: expirySeconds },
    );
    return {
      url,
      method: 'GET',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
    };
  }

  async generateDeleteUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const expirySeconds = options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry;
    const url = await getSignedUrl(
      this.client,
      new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: fileKey }),
      { expiresIn: expirySeconds },
    );
    return {
      url,
      method: 'DELETE',
      expiresAt: this.expiresAt(expirySeconds),
      fileKey,
    };
  }

  async completePresignedUpload(input: PresignedCompleteInput): Promise<PresignedCompleteResult> {
    const head = await this.head(input.fileKey);
    if (!head.exists) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND, {
        details: `Direct upload not found in storage for key ${input.fileKey}.`,
      });
    }
    if (input.expectedSize && Math.abs(head.size - input.expectedSize) > 1024) {
      // 1 KB tolerance for trailing-newline / metadata variance
      throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
        details: `Size mismatch: expected ${input.expectedSize}, found ${head.size}.`,
      });
    }
    return {
      exists: true,
      size: head.size,
      contentType: head.mimeType,
      url: this.buildPublicUrl(input.fileKey),
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  protected buildTempKey(uploadType: string | undefined, filename: string): string {
    const segments = [this.cfg.tempPrefix];
    if (uploadType) segments.push(this.safeSegment(uploadType));
    segments.push(filename);
    return this.normalizePath(segments.join('/'));
  }

  protected buildPermanentKey(uploadType: string, filename: string): string {
    return this.normalizePath(
      `${this.cfg.permanentPrefix}/${this.safeSegment(uploadType)}/${filename}`,
    );
  }

  protected buildPublicUrl(key: string): string {
    if (this.cfg.publicUrl) {
      const base = this.cfg.publicUrl.replace(/\/+$/, '');
      return `${base}/${key}`;
    }
    if (this.cfg.endpoint) {
      const base = this.cfg.endpoint.replace(/\/+$/, '');
      return this.cfg.forcePathStyle
        ? `${base}/${this.cfg.bucket}/${key}`
        : `${base.replace('://', `://${this.cfg.bucket}.`)}/${key}`;
    }
    return `https://${this.cfg.bucket}.s3.${this.cfg.region}.amazonaws.com/${key}`;
  }

  protected urlToKey(fileUrlOrKey: string): string {
    // Accept either an https URL or an already-normalised key.
    if (!/^https?:/i.test(fileUrlOrKey)) {
      return fileUrlOrKey.replace(/^\/+/, '');
    }
    try {
      const u = new URL(fileUrlOrKey);
      let path = u.pathname.replace(/^\/+/, '');
      // Strip the bucket if path-style host is in use.
      if (this.cfg.forcePathStyle && path.startsWith(`${this.cfg.bucket}/`)) {
        path = path.slice(this.cfg.bucket.length + 1);
      }
      return path;
    } catch {
      return fileUrlOrKey.replace(/^\/+/, '');
    }
  }

  protected expiresAt(expirySeconds: number): number {
    return Math.floor((Date.now() + expirySeconds * 1000) / 1000);
  }

  protected flattenMetadata(meta: Record<string, string | undefined>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta)) if (v !== undefined && v !== '') out[k] = v;
    return out;
  }
}
