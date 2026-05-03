import { Injectable, Logger } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { FileTypeConfig, FileTypeRegistry, UploadConfig } from './upload-config.interface';

/**
 * UploadConfigService — centralized configuration for the upload feature.
 *
 * Responsibility: Loads and caches upload-related configuration from environment,
 * validates it, and provides strongly-typed access to all configuration values.
 * All storage providers, validators, and processors depend on this service.
 *
 * Key principle: Configuration drives behavior. Changing provider or settings
 * happens here, not by editing provider classes.
 *
 * Usage:
 *  constructor(private readonly uploadConfig: UploadConfigService) {}
 *  const config = uploadConfig.getConfig();
 *  const fileTypeRules = uploadConfig.getFileTypeConfig('avatar');
 */
@Injectable()
export class UploadConfigService {
  private readonly logger = new Logger(UploadConfigService.name);
  private uploadConfig: UploadConfig;
  private fileTypeRegistry: FileTypeRegistry;

  constructor(private readonly configService: NestConfigService) {
    this.loadConfiguration();
  }

  /**
   * Loads and validates configuration from environment and defaults.
   * Called by: constructor
   *
   * Loads from env vars:
   *  UPLOAD_PROVIDER - storage backend ('local', 's3', 'cloudflare', etc.)
   *  UPLOAD_MAX_FILE_SIZE - max file size in bytes
   *  UPLOAD_TEMP_RETENTION_HOURS - how long temp files are kept
   *  UPLOAD_LOCAL_PATH - local storage base path
   *  S3_REGION, S3_BUCKET, etc. - S3-specific config
   */
  private loadConfiguration(): void {
    this.uploadConfig = {
      provider: this.configService.get<'local' | 's3' | 'cloudflare' | 'gcs' | 'azure'>(
        'UPLOAD_PROVIDER',
        'local',
      ),
      localStoragePath: this.configService.get('UPLOAD_LOCAL_PATH', './uploads'),
      tempStoragePath: this.configService.get('UPLOAD_TEMP_PATH', './uploads/temp'),
      maxFileSize: this.configService.get('UPLOAD_MAX_FILE_SIZE', 10 * 1024 * 1024), // 10MB
      tempRetentionHours: this.configService.get('UPLOAD_TEMP_RETENTION_HOURS', 24),
      maxConcurrentUploads: this.configService.get('UPLOAD_MAX_CONCURRENT', 5),
      maxRetries: this.configService.get('UPLOAD_MAX_RETRIES', 3),
      retryDelayMs: this.configService.get('UPLOAD_RETRY_DELAY_MS', 1000),
      presignedUrlExpiry: this.configService.get('UPLOAD_PRESIGNED_EXPIRY', 3600), // 1 hour
      enablePresignedUrls: this.configService.get('UPLOAD_ENABLE_PRESIGNED_URLS', true),
      enableEncryption: this.configService.get('UPLOAD_ENABLE_ENCRYPTION', true),
      enableAuditLogging: this.configService.get('UPLOAD_ENABLE_AUDIT', true),
      auditLogDestination: this.configService.get('UPLOAD_AUDIT_DESTINATION', 'database') as
        | 'database'
        | 'file'
        | 'cloudwatch',

      // Provider-specific configs
      s3: this.loadS3Config(),
      cloudflare: this.loadCloudflareConfig(),
      gcs: this.loadGcsConfig(),
      azure: this.loadAzureConfig(),
    };

    this.fileTypeRegistry = this.loadFileTypeRegistry();

    this.logger.log(
      `Upload configuration loaded: provider=${this.uploadConfig.provider}, maxFileSize=${this.uploadConfig.maxFileSize}`,
    );
  }

  /**
   * Loads S3-specific configuration from environment variables.
   */
  private loadS3Config() {
    if (this.configService.get('UPLOAD_PROVIDER') !== 's3') {
      return undefined;
    }

    return {
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      bucket: this.configService.get('AWS_S3_BUCKET', ''),
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID', ''),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY', ''),
      endpoint: this.configService.get('AWS_S3_ENDPOINT', undefined),
      maxRetries: this.configService.get('AWS_S3_MAX_RETRIES', 3),
    };
  }

  /**
   * Loads Cloudflare R2-specific configuration from environment variables.
   */
  private loadCloudflareConfig() {
    if (this.configService.get('UPLOAD_PROVIDER') !== 'cloudflare') {
      return undefined;
    }

    return {
      accountId: this.configService.get('CF_ACCOUNT_ID', ''),
      accessKeyId: this.configService.get('CF_ACCESS_KEY_ID', ''),
      secretAccessKey: this.configService.get('CF_SECRET_ACCESS_KEY', ''),
      bucketName: this.configService.get('CF_BUCKET_NAME', ''),
      publicUrl: this.configService.get('CF_PUBLIC_URL', undefined),
    };
  }

  /**
   * Loads GCS-specific configuration from environment variables.
   */
  private loadGcsConfig() {
    if (this.configService.get('UPLOAD_PROVIDER') !== 'gcs') {
      return undefined;
    }

    return {
      projectId: this.configService.get('GCP_PROJECT_ID', ''),
      keyFilename: this.configService.get('GCP_KEY_FILE', undefined),
      bucket: this.configService.get('GCP_BUCKET', ''),
    };
  }

  /**
   * Loads Azure-specific configuration from environment variables.
   */
  private loadAzureConfig() {
    if (this.configService.get('UPLOAD_PROVIDER') !== 'azure') {
      return undefined;
    }

    return {
      connectionString: this.configService.get('AZURE_STORAGE_CONNECTION_STRING', ''),
      containerName: this.configService.get('AZURE_STORAGE_CONTAINER', ''),
    };
  }

  /**
   * Loads file type registry that defines handling for each upload type.
   * Maps upload types (avatar, document, etc.) to their rules.
   */
  private loadFileTypeRegistry(): FileTypeRegistry {
    return {
      avatar: {
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        processing: {
          convertToFormat: 'webp',
          maxWidth: 512,
          maxHeight: 512,
          quality: 85,
        },
        encrypted: false,
        isPublic: true,
        publicCacheTtl: 31536000, // 1 year
      },
      document: {
        allowedMimeTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        encrypted: true,
        isPublic: false,
        retentionDays: 365,
      },
      aadhar: {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        processing: {
          convertToFormat: 'webp',
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 90,
        },
        encrypted: true,
        isPublic: false,
        storageTier: 'standard',
        retentionDays: 2555, // 7 years
      },
      identity: {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        processing: {
          convertToFormat: 'webp',
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 90,
        },
        encrypted: true,
        isPublic: false,
        storageTier: 'standard',
        retentionDays: 2555,
      },
      passport: {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        processing: {
          convertToFormat: 'webp',
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 90,
        },
        encrypted: true,
        isPublic: false,
        storageTier: 'standard',
        retentionDays: 2555,
      },
    };
  }

  /**
   * Returns the complete upload configuration.
   */
  getConfig(): UploadConfig {
    return this.uploadConfig;
  }

  /**
   * Returns configuration for a specific upload type.
   *
   * @param uploadType - Upload type slug (e.g., 'avatar', 'document')
   * @returns FileTypeConfig with rules for this type
   * @throws Error if upload type is not registered
   */
  getFileTypeConfig(uploadType: string): FileTypeConfig {
    if (!this.fileTypeRegistry[uploadType]) {
      throw new Error(`Unknown upload type: ${uploadType}`);
    }
    return this.fileTypeRegistry[uploadType];
  }

  /**
   * Returns all registered file types.
   */
  getFileTypeRegistry(): FileTypeRegistry {
    return this.fileTypeRegistry;
  }

  /**
   * Checks if a given MIME type is allowed for the specified upload type.
   */
  isAllowedMimeType(uploadType: string, mimeType: string): boolean {
    const config = this.getFileTypeConfig(uploadType);
    return config.allowedMimeTypes.includes(mimeType);
  }

  /**
   * Checks if files of the given type should be encrypted.
   */
  shouldEncrypt(uploadType: string): boolean {
    const config = this.getFileTypeConfig(uploadType);
    return config.encrypted && this.uploadConfig.enableEncryption;
  }

  /**
   * Returns the currently active storage provider type.
   */
  getActiveProvider(): string {
    return this.uploadConfig.provider;
  }

  /**
   * Registers or updates file type configuration at runtime.
   * Useful for testing or dynamic configuration.
   */
  registerFileType(uploadType: string, config: FileTypeConfig): void {
    this.fileTypeRegistry[uploadType] = config;
    this.logger.log(`File type registered: ${uploadType}`);
  }
}
