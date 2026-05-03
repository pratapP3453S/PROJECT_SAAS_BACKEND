import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  IPresignedUrlService,
  PresignedUrlOptions,
  PresignedUrlResult,
} from '../interfaces/presigned-url.interface';
import { UploadConfigService } from '../config/upload-config.service';

@Injectable()
export class PresignedUrlService implements IPresignedUrlService {
  constructor(private readonly uploadConfig: UploadConfigService) {}

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
    this.uploadConfig.getFileTypeConfig(uploadType);

    const config = this.uploadConfig.getConfig();
    const expirySeconds = options.expirySeconds ?? config.presignedUrlExpiry;
    const expiresAt = this.expiresAt(expirySeconds);

    if (config.provider === 'local') {
      return {
        url: `/upload/${uploadType}`,
        method: 'POST',
        expiresAt,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        providerData: {
          mode: 'api-proxy',
          fieldName: 'file',
          note: 'Local storage uses the API upload endpoint instead of a signed object-store URL.',
        },
      };
    }

    return this.unsupportedCloudProvider(config.provider, 'upload', fileKey, options, expiresAt);
  }

  async generateDownloadUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const config = this.uploadConfig.getConfig();
    const expiresAt = this.expiresAt(options.expirySeconds ?? config.presignedUrlExpiry);

    if (config.provider === 'local') {
      return {
        url: fileKey.startsWith('/') ? fileKey : `/${fileKey}`,
        method: 'GET',
        expiresAt,
      };
    }

    return this.unsupportedCloudProvider(config.provider, 'download', fileKey, options, expiresAt);
  }

  async generateDeleteUrl(
    fileKey: string,
    options: Partial<PresignedUrlOptions> = {},
  ): Promise<PresignedUrlResult> {
    const config = this.uploadConfig.getConfig();
    const expiresAt = this.expiresAt(options.expirySeconds ?? config.presignedUrlExpiry);
    return this.unsupportedCloudProvider(config.provider, 'delete', fileKey, options, expiresAt);
  }

  async validateUrl(url: string): Promise<boolean> {
    return Boolean(url);
  }

  private expiresAt(expirySeconds: number): number {
    return Math.floor((Date.now() + expirySeconds * 1000) / 1000);
  }

  private unsupportedCloudProvider(
    provider: string,
    operation: string,
    fileKey: string,
    options: Partial<PresignedUrlOptions>,
    expiresAt: number,
  ): PresignedUrlResult {
    return {
      url: '',
      method: options.method ?? (operation === 'download' ? 'GET' : 'PUT'),
      expiresAt,
      providerData: {
        provider,
        operation,
        fileKey,
        implementationRequired:
          'Install the provider SDK and replace this method with a provider adapter. The controller and UploadService do not need to change.',
      },
    };
  }

  private extractExtension(filename: string): string {
    const match = filename.match(/\.[a-zA-Z0-9]+$/);
    return match ? match[0].toLowerCase() : '';
  }
}
