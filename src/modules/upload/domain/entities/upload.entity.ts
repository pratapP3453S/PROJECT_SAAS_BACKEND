/**
 * upload.entity — domain shapes for the upload feature.
 *
 * Layer: domain — pure data types the application uses. Storage backends and
 * controllers map to/from these shapes.
 *
 * UploadResult:
 *  Returned by UploadService.processFile() to UploadController after a
 *  server-mediated upload lands in temp storage.
 *  tempUrl        : relative URL to serve the file from uploads/temp/.
 *  serverFileName : UUID-based filename (used for moveFromTemp).
 *  originalFileName: original client filename (stored in DB for display).
 *  mimeType       : final MIME after processing (often image/webp for images).
 *  size           : byte size of the final (possibly encrypted) buffer.
 *  isEncrypted    : whether AES-256 encryption was applied.
 *
 * MoveFileResult:
 *  Returned by UploadService.commitFile() after the file is moved from temp
 *  to permanent storage.
 *  permanentUrl : final relative URL in uploads/{type}/ (store this in the DB).
 *
 * SENSITIVE_FILE_TYPES:
 *  File type slugs that trigger AES-256 encryption before writing to disk.
 *  Add new sensitive types here and EncryptionService.encryptBuffer() will
 *  automatically be applied in UploadService.processFile().
 *
 * isSensitiveType(type):
 *  Type guard — returns true if `type` is a SensitiveFileType.
 *  Called by UploadService.processFile() to decide whether to encrypt.
 */
export interface UploadResult {
  tempUrl: string;
  serverFileName: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  isEncrypted: boolean;
}

export interface MoveFileResult {
  permanentUrl: string;
  serverFileName: string;
}

export const SENSITIVE_FILE_TYPES = ['aadhar', 'identity', 'document', 'passport'] as const;
export type SensitiveFileType = (typeof SENSITIVE_FILE_TYPES)[number];

export function isSensitiveType(type: string): type is SensitiveFileType {
  return SENSITIVE_FILE_TYPES.includes(type as SensitiveFileType);
}
