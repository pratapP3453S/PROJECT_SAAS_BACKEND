import { Injectable } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { UploadConfigService } from '../config/upload-config.service';
import {
  CloudflareR2ProviderConfig,
  S3ProviderConfig,
} from '../config/upload-config.interface';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * CloudflareR2StorageProvider — R2 is S3-compatible, so we reuse all of
 * S3StorageProvider's logic and only override:
 *  - the underlying S3 client (different endpoint, region 'auto')
 *  - the public-URL builder (R2 serves through r2.dev or a custom domain)
 *
 * This is OCP in action: extending behaviour without modifying the parent.
 */
@Injectable()
export class CloudflareR2StorageProvider extends S3StorageProvider {
  private readonly r2Cfg: CloudflareR2ProviderConfig;

  constructor(uploadConfig: UploadConfigService) {
    // Build a "fake" S3 config from R2 config so the parent constructor passes
    // its `if (!cfg) throw` guard, then override the client below.
    const r2 = uploadConfig.getConfig().cloudflare;
    if (!r2) throw new Error('CloudflareR2StorageProvider: cloudflare configuration missing.');

    const adapted: S3ProviderConfig = {
      region: 'auto',
      bucket: r2.bucketName,
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
      endpoint: r2.endpoint,
      forcePathStyle: true,
      publicUrl: r2.publicUrl,
      maxRetries: 3,
      tempPrefix: r2.tempPrefix,
      permanentPrefix: r2.permanentPrefix,
    };

    // Inject adapted config so super.constructor can read it.
    const originalGet = uploadConfig.getConfig.bind(uploadConfig);
    (uploadConfig as unknown as { getConfig: () => any }).getConfig = () => ({
      ...originalGet(),
      s3: adapted,
    });

    super(uploadConfig);

    // Restore original getConfig to avoid side-effects on later callers.
    (uploadConfig as unknown as { getConfig: () => any }).getConfig = originalGet;

    this.r2Cfg = r2;
    this.logger.log(`Cloudflare R2 endpoint: ${adapted.endpoint}`);
  }

  protected override buildClient(cfg: S3ProviderConfig): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      maxAttempts: cfg.maxRetries ?? 3,
    });
  }

  protected override buildPublicUrl(key: string): string {
    if (this.r2Cfg.publicUrl) {
      return `${this.r2Cfg.publicUrl.replace(/\/+$/, '')}/${key}`;
    }
    // R2 has no default public URL; signed URLs are the only safe way to serve.
    return `${this.r2Cfg.endpoint?.replace(/\/+$/, '')}/${this.r2Cfg.bucketName}/${key}`;
  }
}
