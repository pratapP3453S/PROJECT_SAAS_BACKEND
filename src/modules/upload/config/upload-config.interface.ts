/**
 * Upload Configuration Interface
 *
 * Defines the contract for upload configuration that drives behavior across
 * all storage providers. This allows environment-based configuration without
 * changing code.
 *
 * Key principle: Configuration is INDEPENDENT of storage provider implementation.
 * The same config works whether using LocalStorage, S3, or Cloudflare R2.
 */

export interface UploadConfig {
  // Storage backend selection
  provider: 'local' | 's3' | 'cloudflare' | 'gcs' | 'azure';

  // Local storage paths (used by LocalStorageProvider)
  localStoragePath: string;
  tempStoragePath: string;

  // AWS S3 configuration
  s3?: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string; // for S3-compatible services
    maxRetries?: number;
  };

  // Cloudflare R2 configuration
  cloudflare?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl?: string; // CDN URL for file serving
  };

  // Google Cloud Storage configuration
  gcs?: {
    projectId: string;
    keyFilename?: string;
    bucket: string;
  };

  // Azure Blob Storage configuration
  azure?: {
    connectionString: string;
    containerName: string;
  };

  // File size limits (in bytes)
  maxFileSize: number;

  // Temp file retention (in hours)
  tempRetentionHours: number;

  // Concurrency settings
  maxConcurrentUploads?: number;
  maxConcurrentDownloads?: number;

  // Retry policy
  maxRetries?: number;
  retryDelayMs?: number;

  // Presigned URL configuration
  presignedUrlExpiry: number; // in seconds
  enablePresignedUrls: boolean;

  // Encryption configuration
  enableEncryption: boolean;
  encryptionKeyProvider?: 'env' | 'kms' | 'vault';

  // Audit configuration
  enableAuditLogging: boolean;
  auditLogDestination?: 'database' | 'file' | 'cloudwatch';
}

export interface FileTypeConfig {
  // Supported MIME types for this upload type
  allowedMimeTypes: string[];

  // File processing rules
  processing?: {
    convertToFormat?: string; // e.g., 'webp', 'jpg'
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  };

  // Whether to encrypt before storing
  encrypted: boolean;

  // Storage tier/class (standard, infrequent, glacier)
  storageTier?: 'standard' | 'infrequent' | 'archive';

  // Access control
  isPublic: boolean;
  publicCacheTtl?: number; // in seconds

  // Retention policy
  retentionDays?: number;
}

export interface FileTypeRegistry {
  [uploadType: string]: FileTypeConfig;
}
