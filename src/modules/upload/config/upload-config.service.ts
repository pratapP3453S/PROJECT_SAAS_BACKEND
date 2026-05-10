import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import {
  AzureProviderConfig,
  CloudflareR2ProviderConfig,
  CloudinaryProviderConfig,
  FileTypeConfig,
  FileTypeRegistry,
  GcsProviderConfig,
  ImageKitProviderConfig,
  S3ProviderConfig,
  UploadConfig,
  UploadProviderName,
} from './upload-config.interface';

/**
 * UploadConfigService — single source of truth for upload-related configuration.
 *
 * Responsibility
 *  - Load every UPLOAD_* / AWS_* / CF_* / CLOUDINARY_* / IMAGEKIT_* env var.
 *  - Build a strongly-typed UploadConfig.
 *  - Build the FileTypeRegistry (per-type rules: MIME whitelist, encryption,
 *    processing pipeline, retention).
 *  - Validate the active provider's required keys at boot — fail fast.
 *
 * Design
 *  Configuration is INDEPENDENT of provider implementations. Adding a new
 *  provider here is a pure addition (open/closed): a new loader method, a new
 *  field on UploadConfig, no edits to existing loaders.
 */
@Injectable()
export class UploadConfigService implements OnModuleInit {
  private readonly logger = new Logger(UploadConfigService.name);
  private uploadConfig!: UploadConfig;
  private fileTypeRegistry!: FileTypeRegistry;

  constructor(private readonly configService: NestConfigService) {
    this.loadConfiguration();
  }

  onModuleInit(): void {
    this.validateActiveProvider();
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  private loadConfiguration(): void {
    const provider = this.configService.get<UploadProviderName>('UPLOAD_PROVIDER', 'local');

    // MAX_FILE_SIZE_MB lives in the wider app config; use it as the source of
    // truth so Multer and the validator stay in sync.
    const maxFileSizeMB = Number(this.configService.get('MAX_FILE_SIZE_MB', 10));

    this.uploadConfig = {
      provider,
      localStoragePath: this.configService.get('UPLOAD_DEST', './uploads'),
      tempStoragePath: this.configService.get('UPLOAD_TEMP_PATH', './uploads/temp'),
      publicBaseUrl: this.configService.get('UPLOAD_PUBLIC_BASE_URL', '') || undefined,

      // Local presigned-URL signing. Prefer the dedicated secret; fall back to
      // JWT_SECRET so dev environments work without an extra var. Production
      // should set UPLOAD_LOCAL_SIGNING_SECRET explicitly (≥ 32 chars).
      localSigningSecret:
        this.configService.get<string>('UPLOAD_LOCAL_SIGNING_SECRET') ||
        this.configService.get<string>('JWT_SECRET') ||
        '',

      maxFileSize: maxFileSizeMB * 1024 * 1024,
      tempRetentionHours: Number(this.configService.get('UPLOAD_TEMP_RETENTION_HOURS', 24)),
      maxConcurrentUploads: Number(this.configService.get('UPLOAD_MAX_CONCURRENT', 5)),
      maxRetries: Number(this.configService.get('UPLOAD_MAX_RETRIES', 3)),
      retryDelayMs: Number(this.configService.get('UPLOAD_RETRY_DELAY_MS', 1000)),

      presignedUrlExpiry: Number(this.configService.get('UPLOAD_PRESIGNED_EXPIRY', 3600)),
      enablePresignedUrls: this.toBool(this.configService.get('UPLOAD_ENABLE_PRESIGNED_URLS', true)),

      enableEncryption: this.toBool(this.configService.get('UPLOAD_ENABLE_ENCRYPTION', true)),
      enableAuditLogging: this.toBool(this.configService.get('UPLOAD_ENABLE_AUDIT', true)),
      auditLogDestination: this.configService.get('UPLOAD_AUDIT_DESTINATION', 'database') as
        | 'database'
        | 'file'
        | 'cloudwatch',

      s3: this.loadS3Config(provider),
      cloudflare: this.loadCloudflareConfig(provider),
      cloudinary: this.loadCloudinaryConfig(provider),
      imagekit: this.loadImageKitConfig(provider),
      gcs: this.loadGcsConfig(provider),
      azure: this.loadAzureConfig(provider),
    };

    this.fileTypeRegistry = this.loadFileTypeRegistry();

    this.logger.log(
      `Upload configuration loaded: provider=${provider}, maxFileSize=${maxFileSizeMB}MB, ` +
        `presigned=${this.uploadConfig.enablePresignedUrls}, encryption=${this.uploadConfig.enableEncryption}`,
    );
  }

  // Provider loaders are eager — they always populate the sub-config when the
  // env keys are present, even when not the active provider. This keeps tests
  // deterministic and lets ops verify config without flipping UPLOAD_PROVIDER.
  private loadS3Config(provider: UploadProviderName): S3ProviderConfig | undefined {
    const bucket = this.configService.get<string>('AWS_S3_BUCKET', '');
    if (provider !== 's3' && !bucket) return undefined;

    return {
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
      bucket,
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', ''),
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      endpoint: this.configService.get<string>('AWS_S3_ENDPOINT', '') || undefined,
      forcePathStyle: this.toBool(this.configService.get('AWS_S3_FORCE_PATH_STYLE', false)),
      publicUrl: this.configService.get<string>('AWS_S3_PUBLIC_URL', '') || undefined,
      maxRetries: Number(this.configService.get('AWS_S3_MAX_RETRIES', 3)),
      tempPrefix: this.normalizePrefix(this.configService.get('AWS_S3_TEMP_PREFIX', 'uploads/temp')),
      permanentPrefix: this.normalizePrefix(this.configService.get('AWS_S3_PERMANENT_PREFIX', 'uploads')),
    };
  }

  private loadCloudflareConfig(provider: UploadProviderName): CloudflareR2ProviderConfig | undefined {
    const accountId = this.configService.get<string>('CF_ACCOUNT_ID', '');
    if (provider !== 'cloudflare' && !accountId) return undefined;

    const explicitEndpoint = this.configService.get<string>('CF_ENDPOINT', '');
    return {
      accountId,
      accessKeyId: this.configService.get<string>('CF_ACCESS_KEY_ID', ''),
      secretAccessKey: this.configService.get<string>('CF_SECRET_ACCESS_KEY', ''),
      bucketName: this.configService.get<string>('CF_BUCKET_NAME', ''),
      endpoint:
        explicitEndpoint ||
        (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined),
      publicUrl: this.configService.get<string>('CF_PUBLIC_URL', '') || undefined,
      tempPrefix: this.normalizePrefix(this.configService.get('CF_TEMP_PREFIX', 'uploads/temp')),
      permanentPrefix: this.normalizePrefix(this.configService.get('CF_PERMANENT_PREFIX', 'uploads')),
    };
  }

  private loadCloudinaryConfig(provider: UploadProviderName): CloudinaryProviderConfig | undefined {
    const cloudinaryUrl = this.configService.get<string>('CLOUDINARY_URL', '');
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME', '');
    if (provider !== 'cloudinary' && !cloudinaryUrl && !cloudName) return undefined;

    // CLOUDINARY_URL takes precedence — when it is set, the SDK extracts
    // cloudName/apiKey/apiSecret from it. We mirror those for visibility.
    const fromUrl = this.parseCloudinaryUrl(cloudinaryUrl);

    return {
      cloudinaryUrl: cloudinaryUrl || undefined,
      cloudName: fromUrl?.cloudName ?? cloudName,
      apiKey: fromUrl?.apiKey ?? this.configService.get<string>('CLOUDINARY_API_KEY', ''),
      apiSecret: fromUrl?.apiSecret ?? this.configService.get<string>('CLOUDINARY_API_SECRET', ''),
      folder: this.configService.get<string>('CLOUDINARY_FOLDER', 'uploads'),
      uploadPreset: this.configService.get<string>('CLOUDINARY_UPLOAD_PRESET', '') || undefined,
      useSigned: this.toBool(this.configService.get('CLOUDINARY_USE_SIGNED', true)),
      secure: this.toBool(this.configService.get('CLOUDINARY_SECURE', true)),
    };
  }

  private loadImageKitConfig(provider: UploadProviderName): ImageKitProviderConfig | undefined {
    const publicKey = this.configService.get<string>('IMAGEKIT_PUBLIC_KEY', '');
    if (provider !== 'imagekit' && !publicKey) return undefined;

    return {
      publicKey,
      privateKey: this.configService.get<string>('IMAGEKIT_PRIVATE_KEY', ''),
      urlEndpoint: this.configService.get<string>('IMAGEKIT_URL_ENDPOINT', ''),
      folder: this.configService.get<string>('IMAGEKIT_FOLDER', 'uploads'),
      useUniqueFileName: this.toBool(this.configService.get('IMAGEKIT_USE_UNIQUE_FILENAME', true)),
    };
  }

  private loadGcsConfig(provider: UploadProviderName): GcsProviderConfig | undefined {
    const projectId = this.configService.get<string>('GCP_PROJECT_ID', '');
    if (provider !== 'gcs' && !projectId) return undefined;

    return {
      projectId,
      keyFilename: this.configService.get<string>('GCP_KEY_FILE', '') || undefined,
      bucket: this.configService.get<string>('GCP_BUCKET', ''),
    };
  }

  private loadAzureConfig(provider: UploadProviderName): AzureProviderConfig | undefined {
    const connectionString = this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING', '');
    if (provider !== 'azure' && !connectionString) return undefined;

    return {
      connectionString,
      containerName: this.configService.get<string>('AZURE_STORAGE_CONTAINER', ''),
    };
  }

  // ─── File-type registry ───────────────────────────────────────────────────
  // Each entry defines what's allowed and how the file is processed for that
  // upload type. Adding a new type is purely additive (open/closed).
  private loadFileTypeRegistry(): FileTypeRegistry {
    return {
      avatar: {
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        processing: { convertToFormat: 'webp', maxWidth: 512, maxHeight: 512, quality: 85 },
        encrypted: false,
        isPublic: true,
        publicCacheTtl: 31536000,
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
        processing: { convertToFormat: 'webp', maxWidth: 1024, maxHeight: 1024, quality: 90 },
        encrypted: true,
        isPublic: false,
        storageTier: 'standard',
        retentionDays: 2555,
      },
      identity: {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        processing: { convertToFormat: 'webp', maxWidth: 1024, maxHeight: 1024, quality: 90 },
        encrypted: true,
        isPublic: false,
        storageTier: 'standard',
        retentionDays: 2555,
      },
      passport: {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        processing: { convertToFormat: 'webp', maxWidth: 1024, maxHeight: 1024, quality: 90 },
        encrypted: true,
        isPublic: false,
        storageTier: 'standard',
        retentionDays: 2555,
      },
    };
  }

  // ─── Validation (fail-fast at boot) ───────────────────────────────────────

  private validateActiveProvider(): void {
    const { provider } = this.uploadConfig;
    const missing: string[] = [];

    switch (provider) {
      case 'local':
        // The presigned-URL flow requires an HMAC secret. We accept JWT_SECRET
        // as a fallback (loadConfiguration() handles that), so this only fails
        // when neither key is set.
        if (!this.uploadConfig.localSigningSecret) {
          missing.push('UPLOAD_LOCAL_SIGNING_SECRET (or JWT_SECRET as fallback)');
        }
        break;
      case 's3': {
        const cfg = this.uploadConfig.s3;
        if (!cfg?.bucket) missing.push('AWS_S3_BUCKET');
        if (!cfg?.accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
        if (!cfg?.secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');
        break;
      }
      case 'cloudflare': {
        const cfg = this.uploadConfig.cloudflare;
        if (!cfg?.accountId) missing.push('CF_ACCOUNT_ID');
        if (!cfg?.accessKeyId) missing.push('CF_ACCESS_KEY_ID');
        if (!cfg?.secretAccessKey) missing.push('CF_SECRET_ACCESS_KEY');
        if (!cfg?.bucketName) missing.push('CF_BUCKET_NAME');
        break;
      }
      case 'cloudinary': {
        const cfg = this.uploadConfig.cloudinary;
        const hasUrl = Boolean(cfg?.cloudinaryUrl);
        if (!hasUrl) {
          if (!cfg?.cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
          if (!cfg?.apiKey) missing.push('CLOUDINARY_API_KEY');
          if (!cfg?.apiSecret) missing.push('CLOUDINARY_API_SECRET');
        }
        break;
      }
      case 'imagekit': {
        const cfg = this.uploadConfig.imagekit;
        if (!cfg?.publicKey) missing.push('IMAGEKIT_PUBLIC_KEY');
        if (!cfg?.privateKey) missing.push('IMAGEKIT_PRIVATE_KEY');
        if (!cfg?.urlEndpoint) missing.push('IMAGEKIT_URL_ENDPOINT');
        break;
      }
      case 'gcs':
        if (!this.uploadConfig.gcs?.projectId) missing.push('GCP_PROJECT_ID');
        if (!this.uploadConfig.gcs?.bucket) missing.push('GCP_BUCKET');
        break;
      case 'azure':
        if (!this.uploadConfig.azure?.connectionString) missing.push('AZURE_STORAGE_CONNECTION_STRING');
        if (!this.uploadConfig.azure?.containerName) missing.push('AZURE_STORAGE_CONTAINER');
        break;
    }

    if (missing.length > 0) {
      throw new Error(
        `UploadConfigService: provider "${provider}" is missing required env vars: ${missing.join(
          ', ',
        )}. Set them in .env or change UPLOAD_PROVIDER.`,
      );
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  getConfig(): UploadConfig {
    return this.uploadConfig;
  }

  getFileTypeConfig(uploadType: string): FileTypeConfig {
    if (!this.fileTypeRegistry[uploadType]) {
      throw new Error(`Unknown upload type: ${uploadType}`);
    }
    return this.fileTypeRegistry[uploadType];
  }

  getFileTypeRegistry(): FileTypeRegistry {
    return this.fileTypeRegistry;
  }

  isAllowedMimeType(uploadType: string, mimeType: string): boolean {
    const config = this.getFileTypeConfig(uploadType);
    return config.allowedMimeTypes.includes(mimeType);
  }

  shouldEncrypt(uploadType: string): boolean {
    const config = this.getFileTypeConfig(uploadType);
    return config.encrypted && this.uploadConfig.enableEncryption;
  }

  getActiveProvider(): UploadProviderName {
    return this.uploadConfig.provider;
  }

  registerFileType(uploadType: string, config: FileTypeConfig): void {
    this.fileTypeRegistry[uploadType] = config;
    this.logger.log(`File type registered: ${uploadType}`);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private toBool(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null) return false;
    const s = String(value).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }

  private normalizePrefix(prefix: string): string {
    return (prefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private parseCloudinaryUrl(url: string):
    | { cloudName: string; apiKey: string; apiSecret: string }
    | undefined {
    if (!url) return undefined;
    try {
      // cloudinary://{api_key}:{api_secret}@{cloud_name}
      const parsed = new URL(url);
      if (parsed.protocol !== 'cloudinary:') return undefined;
      return {
        apiKey: decodeURIComponent(parsed.username),
        apiSecret: decodeURIComponent(parsed.password),
        cloudName: parsed.hostname,
      };
    } catch {
      return undefined;
    }
  }
}
