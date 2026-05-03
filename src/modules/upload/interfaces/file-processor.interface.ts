/**
 * File Processing Strategy Interface
 *
 * Encapsulates file transformation logic (image resizing, format conversion, etc.).
 * Separates business logic (what transformations to apply) from storage logic
 * (where to put the file).
 *
 * Key principle: Processing is INDEPENDENT of storage provider and validation.
 * Processors handle: image resizing, format conversion, compression, metadata extraction.
 * Processors DO NOT handle: where the file is stored, encryption, or validation.
 */

export interface ProcessingOptions {
  // Image/media processing
  convertToFormat?: string; // 'webp', 'jpg', 'png', etc.
  maxWidth?: number; // max dimension in pixels
  maxHeight?: number;
  quality?: number; // compression quality 0-100
  stripMetadata?: boolean; // remove EXIF, ICC profile, etc.
  autoRotate?: boolean; // auto-correct EXIF orientation

  // Advanced options
  thumbnail?: {
    width: number;
    height: number;
  };
}

export interface ProcessingContext {
  fallbackMimeType: string;
  fallbackExtension: string;
}

export interface ProcessedFile {
  buffer: Buffer;
  format: string; // final format (e.g., 'webp')
  mimeType: string;
  size: number;
  metadata?: {
    width?: number;
    height?: number;
    colorspace?: string;
    hasAlpha?: boolean;
  };
}

export interface IFileProcessor {
  /**
   * Process a file according to the given options.
   * For images: convert format, resize, compress, rotate.
   * For documents: may validate structure, extract metadata.
   *
   * @param fileBuffer - Raw file content
   * @param options - Processing rules
   * @returns ProcessedFile with transformed buffer and metadata
   * @throws Error if processing fails (e.g., unsupported format)
   */
  process(
    fileBuffer: Buffer,
    options: ProcessingOptions,
    context?: ProcessingContext,
  ): Promise<ProcessedFile>;

  /**
   * Extracts metadata from a file without modifying it.
   * Useful for determining optimal processing settings.
   *
   * @param fileBuffer - File content
   * @returns Object with width, height, format, colorspace, etc.
   */
  extractMetadata(fileBuffer: Buffer): Promise<Record<string, any>>;

  /**
   * Generates a thumbnail from the file.
   * @param fileBuffer - File content
   * @param width - Thumbnail width
   * @param height - Thumbnail height
   * @returns Buffer containing thumbnail
   */
  generateThumbnail(fileBuffer: Buffer, width: number, height: number): Promise<Buffer>;
}
