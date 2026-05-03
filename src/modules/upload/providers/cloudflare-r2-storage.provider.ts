import { Injectable } from '@nestjs/common';
import { Errors } from '../../../common/constants/error.constants';
import { ApiError } from '../../../common/errors/api.error';
import { SaveFileInput, StoredFile } from '../interfaces/storage-provider.interface';
import { BaseStorageProvider } from './base-storage.provider';

@Injectable()
export class CloudflareR2StorageProvider extends BaseStorageProvider {
  constructor() {
    super('CloudflareR2');
  }

  async saveTemp(_input: SaveFileInput): Promise<StoredFile> {
    this.throwNotInstalled();
  }

  async commitToPermanent(_filename: string, _type: string): Promise<StoredFile> {
    this.throwNotInstalled();
  }

  async delete(_fileUrl: string): Promise<boolean> {
    this.throwNotInstalled();
  }

  async cleanupTemp(_olderThanHours = 24): Promise<number> {
    this.throwNotInstalled();
  }

  private throwNotInstalled(): never {
    throw ApiError.fromDefinition(Errors.INTERNAL_SERVER_ERROR, {
      details:
        'CloudflareR2StorageProvider is an adapter slot. Install the S3-compatible SDK, inject an R2 client, and bind this provider in UploadModule before setting UPLOAD_PROVIDER=cloudflare.',
    });
  }
}
