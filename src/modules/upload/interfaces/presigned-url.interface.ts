/**
 * Presigned URL Service Interface
 *
 * Generates time-limited, signed URLs that allow direct uploads/downloads
 * without going through your API. Critical for cloud storage integrations.
 *
 * Key principle: Presigned URLs are PROVIDER-SPECIFIC but follow a COMMON INTERFACE.
 * Each storage provider (S3, Cloudflare R2, GCS, Azure) implements differently,
 * but the service layer doesn't care.
 *
 * Use cases:
 * 1. Direct browser upload to S3/R2/GCS without touching your server
 * 2. Direct file download/streaming from CDN
 * 3. Restricted access - URLs expire after N seconds
 * 4. Audit trail - URLs can include metadata/user info
 */

export interface PresignedUrlOptions {
  // Expiry time in seconds
  expirySeconds: number;

  // HTTP method this URL allows
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';

  // Custom headers to include in the request
  customHeaders?: Record<string, string>;

  // Metadata/tags to attach (provider-specific)
  metadata?: Record<string, string>;

  // Content type the client will upload
  contentType?: string;

  // Maximum file size (some providers support this)
  maxSizeBytes?: number;
}

export interface PresignedUrlResult {
  // The signed URL
  url: string;

  // HTTP method for this URL
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';

  // Expiry timestamp (Unix seconds)
  expiresAt: number;

  // Additional headers to send with the request
  headers?: Record<string, string>;

  // Form data if using POST (multipart/form-data)
  formData?: Record<string, string>;

  // Provider-specific fields
  providerData?: Record<string, any>;
}

export interface IPresignedUrlService {
  /**
   * Generates a presigned URL for uploading a file.
   * Browser can PUT/POST to this URL without authentication.
   *
   * Use case: User uploads avatar → server generates presigned URL →
   *           browser uploads directly to S3/R2 → webhook notifies server
   *
   * @param fileKey - File path/key in storage (e.g., 'uploads/avatar/user-123.webp')
   * @param uploadType - Upload type for metadata
   * @param options - Presigned URL options
   * @returns PresignedUrlResult with signed upload URL
   */
  generateUploadUrl(
    fileKey: string,
    uploadType: string,
    options?: Partial<PresignedUrlOptions>,
  ): Promise<PresignedUrlResult>;

  /**
   * Generates a presigned URL for downloading a file.
   * Browser can GET this URL without authentication.
   *
   * Use case: User downloads encrypted document → server generates download URL →
   *           browser retrieves file from CDN without passing through server
   *
   * @param fileKey - File path/key in storage
   * @param options - Presigned URL options
   * @returns PresignedUrlResult with signed download URL
   */
  generateDownloadUrl(
    fileKey: string,
    options?: Partial<PresignedUrlOptions>,
  ): Promise<PresignedUrlResult>;

  /**
   * Generates a presigned URL for deleting a file.
   * Useful for cleanup operations. Rarely exposed to end users.
   *
   * @param fileKey - File path/key in storage
   * @param options - Presigned URL options
   * @returns PresignedUrlResult with signed delete URL
   */
  generateDeleteUrl(
    fileKey: string,
    options?: Partial<PresignedUrlOptions>,
  ): Promise<PresignedUrlResult>;

  /**
   * Validates that a presigned URL is still valid.
   * Use before redirecting user to ensure URL hasn't expired.
   *
   * @param url - The presigned URL to validate
   * @returns true if valid, false if expired or invalid
   */
  validateUrl(url: string): Promise<boolean>;
}
