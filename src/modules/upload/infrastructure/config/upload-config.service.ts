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

// ─── Format catalogues (production-ready MIME allowlists) ──────────────────
// Pulled into a module-level constant so they're reused between the
// FileTypeRegistry below and any other code that needs to inspect the
// supported MIME types (e.g. multer.lib).

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
];

const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/3gpp',
  'video/3gpp2',
  'video/x-flv',
  'video/x-ms-wmv',
  'video/ogg',
];

const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
  'audio/x-m4a',
  'audio/x-ms-wma',
  'audio/midi',
  'audio/opus',
];

const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'text/plain',
  'text/markdown',
  'text/html',
];

const SPREADSHEET_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
  'text/tab-separated-values',
];

const PRESENTATION_MIME_TYPES = [
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.apple.keynote',
];

const ARCHIVE_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-bzip2',
];

/**
 * Re-exported for non-registry consumers (e.g. multer.lib's default allow-list
 * which must accept anything the registry might validate). Keeping a single
 * source of truth prevents drift.
 */
export const UPLOAD_FORMATS = {
  image: IMAGE_MIME_TYPES,
  video: VIDEO_MIME_TYPES,
  audio: AUDIO_MIME_TYPES,
  document: DOCUMENT_MIME_TYPES,
  spreadsheet: SPREADSHEET_MIME_TYPES,
  presentation: PRESENTATION_MIME_TYPES,
  archive: ARCHIVE_MIME_TYPES,
  all: [
    ...IMAGE_MIME_TYPES,
    ...VIDEO_MIME_TYPES,
    ...AUDIO_MIME_TYPES,
    ...DOCUMENT_MIME_TYPES,
    ...SPREADSHEET_MIME_TYPES,
    ...PRESENTATION_MIME_TYPES,
    ...ARCHIVE_MIME_TYPES,
  ],
} as const;

const MB = 1024 * 1024;

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
 *
 * Layer: infrastructure/config — depends on @nestjs/config and reads env vars;
 * not part of the domain.
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

    // MAX_FILE_SIZE_MB lives in the wider app config; it's the GLOBAL ceiling
    // used by Multer and by any category that doesn't set its own override.
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

      maxFileSize: maxFileSizeMB * MB,
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
        `categories=${Object.keys(this.fileTypeRegistry).length}, ` +
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
  //
  // Categories shipped out of the box (production-ready):
  //
  //   avatar        Profile pictures — image-only, small, converted to WebP @ 512px.
  //   image         General-purpose images — broad image MIME allow-list, 25 MB cap.
  //   video         Video files — broad video MIME allow-list, 500 MB cap, no transcoding.
  //   audio         Audio files — broad audio MIME allow-list, 50 MB cap, no transcoding.
  //   document      PDF, DOC/DOCX, TXT, RTF, ODT, MD, HTML — 25 MB cap, encrypted at rest.
  //   spreadsheet   XLS, XLSX, CSV, ODS, TSV — 25 MB cap, encrypted at rest.
  //   presentation  PPT, PPTX, ODP, KEY — 50 MB cap (decks get fat), encrypted at rest.
  //   archive       ZIP / RAR / 7Z / TAR / GZ / BZ2 — 100 MB cap, NOT scanned (BYO scanner).
  //   aadhar / identity / passport  Tight image-only allow-list for KYC; encrypted, 7-year retention.
  //
  // Per-category limits override the global MAX_FILE_SIZE_MB ceiling because
  // it's wildly inappropriate to size a 4K video upload the same as an avatar.
  // The validator uses `maxFileSizeBytes` when present and falls back to the
  // global limit otherwise.
  private loadFileTypeRegistry(): FileTypeRegistry {
    return {
      // ─── Avatars (image, public, processed) ─────────────────────────────
      avatar: {
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxFileSizeBytes: 5 * MB,
        processing: { convertToFormat: 'webp', maxWidth: 512, maxHeight: 512, quality: 85 },
        encrypted: false,
        isPublic: true,
        publicCacheTtl: 31536000,
      },

      // ─── General images (image, public, processed) ──────────────────────
      image: {
        allowedMimeTypes: IMAGE_MIME_TYPES,
        maxFileSizeBytes: 25 * MB,
        processing: { convertToFormat: 'webp', maxWidth: 4096, maxHeight: 4096, quality: 85 },
        encrypted: false,
        isPublic: true,
        publicCacheTtl: 31536000,
      },

      // ─── Video (binary, public, NOT transcoded) ─────────────────────────
      // Processing is deliberately omitted — Sharp can't transcode video.
      // Wire up an ffmpeg-based processor only when there's a real need.
      video: {
        allowedMimeTypes: VIDEO_MIME_TYPES,
        maxFileSizeBytes: 500 * MB,
        encrypted: false,
        isPublic: true,
        publicCacheTtl: 604800, // 7 days
      },

      // ─── Audio (binary, public, NOT transcoded) ─────────────────────────
      audio: {
        allowedMimeTypes: AUDIO_MIME_TYPES,
        maxFileSizeBytes: 50 * MB,
        encrypted: false,
        isPublic: true,
        publicCacheTtl: 604800,
      },

      // ─── Documents (PDF, DOC, DOCX, TXT, RTF, ODT, MD, HTML) ────────────
      document: {
        allowedMimeTypes: DOCUMENT_MIME_TYPES,
        maxFileSizeBytes: 25 * MB,
        encrypted: true,
        isPublic: false,
        retentionDays: 365,
      },

      // ─── Spreadsheets (XLS, XLSX, CSV, ODS, TSV) ────────────────────────
      spreadsheet: {
        allowedMimeTypes: SPREADSHEET_MIME_TYPES,
        maxFileSizeBytes: 25 * MB,
        encrypted: true,
        isPublic: false,
        retentionDays: 365,
      },

      // ─── Presentations (PPT, PPTX, ODP, KEY) ────────────────────────────
      presentation: {
        allowedMimeTypes: PRESENTATION_MIME_TYPES,
        maxFileSizeBytes: 50 * MB,
        encrypted: true,
        isPublic: false,
        retentionDays: 365,
      },

      // ─── Archives (ZIP, RAR, 7Z, TAR, GZ, BZ2) ──────────────────────────
      // Stored as-is. If you need to scan contents (malware, contraband),
      // hook IMalwareScanner into FileValidatorService.validate().
      archive: {
        allowedMimeTypes: ARCHIVE_MIME_TYPES,
        maxFileSizeBytes: 100 * MB,
        encrypted: true,
        isPublic: false,
        retentionDays: 90,
      },

      // ─── KYC / identity (legally sensitive — encrypted, long retention) ─
      aadhar: {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        maxFileSizeBytes: 5 * MB,
        processing: { convertToFormat: 'webp', maxWidth: 1024, maxHeight: 1024, quality: 90 },
        encrypted: true,
        isPublic: false,
        storageTier: 'standard',
        retentionDays: 2555, // 7 years
      },
      identity: {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        maxFileSizeBytes: 5 * MB,
        processing: { convertToFormat: 'webp', maxWidth: 1024, maxHeight: 1024, quality: 90 },
        encrypted: true,
        isPublic: false,
        storageTier: 'standard',
        retentionDays: 2555,
      },
      passport: {
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        maxFileSizeBytes: 5 * MB,
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

  /**
   * Effective size cap for the given category. Uses the per-category override
   * when set, otherwise the global MAX_FILE_SIZE_MB ceiling.
   */
  getMaxFileSize(uploadType?: string): number {
    if (uploadType) {
      const cfg = this.fileTypeRegistry[uploadType];
      if (cfg?.maxFileSizeBytes) return cfg.maxFileSizeBytes;
    }
    return this.uploadConfig.maxFileSize;
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
