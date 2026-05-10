/**
 * upload-config.interface — typed shape of all upload configuration.
 *
 * Goal: Configuration is INDEPENDENT of any concrete provider implementation.
 * Adding a new backend means adding a new provider class and a new optional
 * sub-block here — no edits to UploadService, UploadController, or any other
 * provider class. (Open/Closed Principle.)
 *
 * Provider sub-blocks are optional; the active provider's keys are validated
 * inside UploadConfigService at startup so misconfiguration fails fast.
 */

export type UploadProviderName =
  | 'local'
  | 's3'
  | 'cloudflare'
  | 'cloudinary'
  | 'imagekit'
  | 'gcs'
  | 'azure';

export interface S3ProviderConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  publicUrl?: string;
  maxRetries?: number;
  tempPrefix: string;
  permanentPrefix: string;
}

export interface CloudflareR2ProviderConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string;
  publicUrl?: string;
  tempPrefix: string;
  permanentPrefix: string;
}

export interface CloudinaryProviderConfig {
  cloudinaryUrl?: string;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  uploadPreset?: string;
  useSigned: boolean;
  secure: boolean;
}

export interface ImageKitProviderConfig {
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
  folder: string;
  useUniqueFileName: boolean;
}

export interface GcsProviderConfig {
  projectId: string;
  keyFilename?: string;
  bucket: string;
}

export interface AzureProviderConfig {
  connectionString: string;
  containerName: string;
}

export interface UploadConfig {
  // ─── Core / cross-provider ───────────────────────────────────────────────
  provider: UploadProviderName;
  localStoragePath: string;
  tempStoragePath: string;
  publicBaseUrl?: string;

  /**
   * HMAC-SHA256 secret used by LocalStorageProvider to sign presigned URLs
   * pointing back at the API. Falls back to JWT_SECRET in dev.
   */
  localSigningSecret: string;

  maxFileSize: number;
  tempRetentionHours: number;
  maxConcurrentUploads?: number;
  maxConcurrentDownloads?: number;
  maxRetries?: number;
  retryDelayMs?: number;

  presignedUrlExpiry: number;
  enablePresignedUrls: boolean;

  enableEncryption: boolean;
  encryptionKeyProvider?: 'env' | 'kms' | 'vault';

  enableAuditLogging: boolean;
  auditLogDestination?: 'database' | 'file' | 'cloudwatch';

  // ─── Provider-specific (only the active one is required) ─────────────────
  s3?: S3ProviderConfig;
  cloudflare?: CloudflareR2ProviderConfig;
  cloudinary?: CloudinaryProviderConfig;
  imagekit?: ImageKitProviderConfig;
  gcs?: GcsProviderConfig;
  azure?: AzureProviderConfig;
}

export interface FileTypeConfig {
  allowedMimeTypes: string[];
  processing?: {
    convertToFormat?: string;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  };
  encrypted: boolean;
  storageTier?: 'standard' | 'infrequent' | 'archive';
  isPublic: boolean;
  publicCacheTtl?: number;
  retentionDays?: number;
}

export interface FileTypeRegistry {
  [uploadType: string]: FileTypeConfig;
}
