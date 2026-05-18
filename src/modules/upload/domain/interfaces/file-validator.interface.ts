/**
 * File Validation Strategy Interface (domain port).
 *
 * Encapsulates file validation logic. Implementations can validate:
 * - MIME type correctness
 * - File size limits
 * - File content inspection (magic bytes)
 * - Virus scanning
 * - Custom business rules
 *
 * Key principle: Validation is SEPARATE from processing and storage.
 * Any validator can be swapped by changing DI binding in module.
 */

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface IFileValidator {
  /**
   * Validates a file against type-specific rules.
   *
   * @param file - Multer file object
   * @param uploadType - Upload type slug (e.g., 'avatar', 'document')
   * @returns ValidationError[] - empty array if valid, errors otherwise
   */
  validate(file: Express.Multer.File, uploadType: string): Promise<ValidationError[]>;

  /**
   * Validates file size.
   * @returns true if valid, false otherwise
   */
  validateSize(fileSizeBytes: number): Promise<boolean>;

  /**
   * Validates MIME type.
   * @returns true if valid, false otherwise
   */
  validateMimeType(mimeType: string, uploadType: string): Promise<boolean>;

  /**
   * Validates file content (magic bytes).
   * Ensures file extension/MIME type matches actual content.
   * @returns true if valid, false otherwise
   */
  validateContent(fileBuffer: Buffer, expectedMimeType: string): Promise<boolean>;
}

/**
 * Virus/Malware Scanning Interface (Optional)
 * Implement if you need ClamAV, VirusTotal, or similar scanning.
 */
export interface IMalwareScanner {
  /**
   * Scans a file for malware.
   * @returns true if safe, false if threat detected
   */
  scan(fileBuffer: Buffer): Promise<boolean>;
}
