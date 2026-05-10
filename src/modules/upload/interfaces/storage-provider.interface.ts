/**
 * storage-provider.interface — contract for all file-storage backends.
 *
 * Goal
 *  UploadService never imports a concrete provider. It only knows this
 *  interface, injected via the STORAGE_PROVIDER DI token. To swap backends:
 *     1. Implement IStorageProvider in a new class.
 *     2. Register it in the STORAGE_PROVIDER_REGISTRY factory in UploadModule.
 *     3. Set UPLOAD_PROVIDER=<your-name>. No edits to existing code.
 *
 * This is the strict OCP boundary for the upload feature.
 *
 * Layout invariants every provider must respect
 *   tempUrl       /uploads/temp/{filename}        — staging
 *   permanentUrl  /uploads/{type}/{filename}      — committed
 *   ⤷ for cloud providers, the same shape with a CDN/origin host prefixed
 *     when UPLOAD_PUBLIC_BASE_URL or AWS_S3_PUBLIC_URL / CF_PUBLIC_URL is set.
 */

export interface SaveFileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
  isEncrypted: boolean;
  uploadType?: string;
  metadata?: Record<string, string>;
}

export interface StoredFile {
  /** Public/relative URL the caller persists for later retrieval. */
  url: string;
  /** UUID-based filename without path. */
  filename: string;
  /** Size in bytes as reported by the backend. */
  size: number;
  /** Storage-side key (e.g. s3 object key). Optional for local. */
  key?: string;
  /** Backend-reported content type if available. */
  mimeType?: string;
}

export interface ObjectHead {
  exists: boolean;
  size: number;
  mimeType?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface IStorageProvider {
  /** Persist a processed file to temporary staging storage. */
  saveTemp(input: SaveFileInput): Promise<StoredFile>;

  /**
   * Promote a temp file to its permanent location under `type`.
   *
   * `tempIdentifier` accepts BOTH forms produced by the upload pipeline:
   *  - flat filename (server-mediated upload — leaf of /uploads/temp/...), or
   *  - full temp key like "uploads/temp/u-7/aadhar/abc.png" (presigned upload).
   *
   * Implementations detect which form they received by looking for '/'.
   * Both forms commit to the same flat permanent shape so persisted URLs
   * never depend on which upload flow produced them.
   */
  commitToPermanent(tempIdentifier: string, type: string): Promise<StoredFile>;

  /** Idempotent delete by URL (false when already gone, never throws). */
  delete(fileUrl: string): Promise<boolean>;

  /** Purge temp objects older than the threshold; never throws. */
  cleanupTemp(olderThanHours?: number): Promise<number>;

  /**
   * Inspect an object by key (NOT by URL). Used by:
   *  - completePresignedUpload — verify a direct upload actually arrived.
   *  - audit / debugging endpoints.
   * Implementations should return { exists: false } rather than throwing
   * when the key is missing.
   */
  head(fileKey: string): Promise<ObjectHead>;
}
