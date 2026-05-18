import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PRESIGNED_URL_PROVIDER } from '../../domain/constants/upload.constants';
import { UploadConfigService } from '../../infrastructure/config/upload-config.service';
import {
  IPresignedUrlProvider,
  IPresignedUrlService,
  PresignedCompleteInput,
  PresignedCompleteResult,
  PresignedUrlOptions,
  PresignedUrlResult,
} from '../../domain/interfaces/presigned-url.interface';

/**
 * PresignedUrlService — thin facade over the active IPresignedUrlProvider.
 *
 * Layer: application/use-cases — the public surface controllers depend on.
 *
 * Why a facade?
 *  - Controllers depend only on this service (no @Inject token needed elsewhere).
 *  - Adds cross-cutting concerns: key construction, default expiry from config,
 *    enable-flag enforcement.
 *  - Keeps provider classes free of "default values" logic — they only sign.
 */
@Injectable()
export class PresignedUrlService implements IPresignedUrlService {
  constructor(
    private readonly uploadConfig: UploadConfigService,
    @Inject(PRESIGNED_URL_PROVIDER) private readonly provider: IPresignedUrlProvider,
  ) {}

  /**
   * Build a deterministic, collision-free object key.
   *  uploads/temp/{userId?}/{uploadType}/{uuid}{ext}
   * Used as the signed-upload target key AND the key the caller passes back to
   * /complete after the direct upload finishes.
   */
  buildUploadKey(uploadType: string, originalFilename: string, userId?: string): string {
    const extension = this.extractExtension(originalFilename);
    const ownerPrefix = userId ? `${userId}/` : '';
    return `uploads/temp/${ownerPrefix}${uploadType}/${uuidv4()}${extension}`;
  }

  async generateUploadUrl(
    fileKey: string,
    uploadType: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    this.assertEnabled();
    // Validates the type early so we don't sign for unknown categories.
    this.uploadConfig.getFileTypeConfig(uploadType);
    return this.provider.generateUploadUrl(fileKey, uploadType, this.withDefaults(options));
  }

  async generateDownloadUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    return this.provider.generateDownloadUrl(fileKey, this.withDefaults(options));
  }

  async generateDeleteUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    this.assertEnabled();
    return this.provider.generateDeleteUrl(fileKey, this.withDefaults(options));
  }

  async completePresignedUpload(input: PresignedCompleteInput): Promise<PresignedCompleteResult> {
    this.uploadConfig.getFileTypeConfig(input.uploadType);
    return this.provider.completePresignedUpload(input);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private assertEnabled(): void {
    if (!this.uploadConfig.getConfig().enablePresignedUrls) {
      throw new Error(
        'Presigned URLs are disabled. Set UPLOAD_ENABLE_PRESIGNED_URLS=true to enable.',
      );
    }
  }

  private withDefaults(options: Partial<PresignedUrlOptions>): Partial<PresignedUrlOptions> {
    return {
      ...options,
      expirySeconds: options.expirySeconds ?? this.uploadConfig.getConfig().presignedUrlExpiry,
    };
  }

  private extractExtension(filename: string): string {
    const match = filename.match(/\.[a-zA-Z0-9]+$/);
    return match ? match[0].toLowerCase() : '';
  }
}
