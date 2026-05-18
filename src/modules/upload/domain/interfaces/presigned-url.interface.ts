/**
 * presigned-url.interface — contract for direct browser ↔ storage uploads.
 *
 * Layer: domain/interfaces — abstract ports. Provider implementations and the
 * facade service depend on these types, not the other way around.
 *
 * Two-layer design
 *  IPresignedUrlProvider  : provider-specific signing logic. One implementation
 *                           per backend (S3, R2, Cloudinary, ImageKit, Local).
 *                           Bound to PRESIGNED_URL_PROVIDER token by the module
 *                           factory using UploadConfigService.getActiveProvider().
 *  IPresignedUrlService   : thin facade injected by controllers. Delegates to
 *                           the active provider. Adds defaults from config and
 *                           validation that doesn't depend on the provider.
 *
 * The "presigned upload" flow
 *  1. Client → POST /v1/upload/presigned-url        server returns signed URL + key
 *  2. Client → PUT/POST {signedUrl}                 bytes go straight to storage
 *  3. Client → POST /v1/upload/presigned-url/complete  server verifies & records
 *
 * Step 3 is critical. The signed URL bypasses the API, so the API never sees
 * the bytes. completePresignedUpload() asks the storage backend to stat the
 * object and confirm it exists, encryption flag, real size, etc. Without this,
 * a malicious client can claim "I uploaded X" without ever having done so.
 */

export type PresignedHttpMethod = 'GET' | 'PUT' | 'POST' | 'DELETE';

export interface PresignedUrlOptions {
  expirySeconds: number;
  method: PresignedHttpMethod;
  customHeaders?: Record<string, string>;
  metadata?: Record<string, string>;
  contentType?: string;
  maxSizeBytes?: number;
}

export interface PresignedUrlResult {
  url: string;
  method: PresignedHttpMethod;
  expiresAt: number;
  /** Object key the storage backend will create. Pass back in /complete. */
  fileKey: string;
  /** Headers the client MUST include when sending the bytes. */
  headers?: Record<string, string>;
  /** For POST policies (S3 multipart-form, Cloudinary, ImageKit). */
  formData?: Record<string, string>;
  /** Provider-specific extras (signature, token, expire timestamp, …). */
  providerData?: Record<string, any>;
}

export interface PresignedCompleteInput {
  /** Object key returned by generateUploadUrl(). */
  fileKey: string;
  uploadType: string;
  /** Size the client claims (cross-checked against storage). */
  expectedSize?: number;
  /** Provider-specific receipt (Cloudinary signed response, ImageKit fileId, etc.). */
  providerReceipt?: Record<string, any>;
}

export interface PresignedCompleteResult {
  /** True if the object exists in temp storage. */
  exists: boolean;
  /** True size in bytes from the storage backend. */
  size: number;
  /** Storage-reported MIME type if the backend exposes one. */
  contentType?: string;
  /** Public/temp URL the caller can persist. */
  url: string;
  /**
   * The verified temp key. Pass this back as `fileKey` to POST /upload/commit
   * to promote the file to its permanent {type}/ location. Echoed here so
   * clients don't have to remember the key issued by /presigned-url.
   */
  fileKey: string;
}

/** Per-provider signing logic. Bound to the PRESIGNED_URL_PROVIDER DI token. */
export interface IPresignedUrlProvider {
  generateUploadUrl(
    fileKey: string,
    uploadType: string,
    options?: Partial<PresignedUrlOptions>,
  ): Promise<PresignedUrlResult>;

  generateDownloadUrl(
    fileKey: string,
    options?: Partial<PresignedUrlOptions>,
  ): Promise<PresignedUrlResult>;

  generateDeleteUrl(
    fileKey: string,
    options?: Partial<PresignedUrlOptions>,
  ): Promise<PresignedUrlResult>;

  /**
   * Verify a direct upload completed. Implementations should call the storage
   * backend (HEAD object, /resources by id, etc.) — never trust the client.
   */
  completePresignedUpload(input: PresignedCompleteInput): Promise<PresignedCompleteResult>;
}

/** Public API consumed by controllers. */
export interface IPresignedUrlService extends IPresignedUrlProvider {
  buildUploadKey(uploadType: string, originalFilename: string, userId?: string): string;
}
