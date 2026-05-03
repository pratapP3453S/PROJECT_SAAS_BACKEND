import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import {
  IFileProcessor,
  ProcessedFile,
  ProcessingContext,
  ProcessingOptions,
} from '../interfaces/file-processor.interface';
import { UploadConfigService } from '../config/upload-config.service';

/**
 * FileProcessorService — implements IFileProcessor
 *
 * Handles image/file transformation:
 * - Format conversion (PNG → WebP, etc.)
 * - Resizing and compression
 * - Metadata extraction
 * - Thumbnail generation
 *
 * Currently uses Sharp for image processing. Can be extended for:
 * - PDF manipulation
 * - Video transcoding
 * - Document format conversion
 *
 * Key principle: Processor is AGNOSTIC of storage/encryption/validation.
 * It only knows how to transform files.
 */
@Injectable()
export class FileProcessorService implements IFileProcessor {
  private readonly logger = new Logger(FileProcessorService.name);

  constructor(private readonly uploadConfig: UploadConfigService) {}

  /**
   * Processes a file according to the given options.
   * Typically: EXIF rotation → resize → format conversion → compression
   *
   * @param fileBuffer - Raw file content
   * @param options - Processing rules
   * @returns ProcessedFile with transformed buffer and metadata
   */
  async process(
    fileBuffer: Buffer,
    options: ProcessingOptions,
    context?: ProcessingContext,
  ): Promise<ProcessedFile> {
    try {
      if (!this.shouldTransform(options)) {
        return {
          buffer: fileBuffer,
          format: context?.fallbackExtension || this.extensionFromMime(context?.fallbackMimeType),
          mimeType: context?.fallbackMimeType || 'application/octet-stream',
          size: fileBuffer.length,
          metadata: {},
        };
      }

      let pipeline = sharp(fileBuffer);

      // 1. Auto-rotate based on EXIF orientation
      if (options.autoRotate !== false) {
        pipeline = pipeline.rotate();
      }

      // Sharp strips metadata by default. Keep metadata only when explicitly requested.
      if (options.stripMetadata === false) {
        pipeline = pipeline.withMetadata();
      }

      // 3. Resize if dimensions specified
      if (options.maxWidth || options.maxHeight) {
        pipeline = pipeline.resize({
          width: options.maxWidth,
          height: options.maxHeight,
          withoutEnlargement: true,
          fit: 'cover',
        });
      }

      // 4. Convert format (WebP, JPEG, PNG, etc.)
      const targetFormat = (options.convertToFormat || 'webp').toLowerCase();
      const quality = options.quality || 80;

      if (targetFormat === 'webp') {
        pipeline = pipeline.webp({ quality, effort: 4 });
      } else if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
        pipeline = pipeline.jpeg({ quality });
      } else if (targetFormat === 'png') {
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else if (targetFormat === 'avif') {
        pipeline = pipeline.avif({ quality });
      } else {
        // Default to WebP if format not recognized
        pipeline = pipeline.webp({ quality, effort: 4 });
      }

      const processedBuffer = await pipeline.toBuffer();
      const metadata = await sharp(processedBuffer).metadata();

      this.logger.log(
        `File processed: ${targetFormat} ${metadata.width}x${metadata.height} (${processedBuffer.length} bytes)`,
      );

      return {
        buffer: processedBuffer,
        format: targetFormat,
        mimeType: this.getMimeType(targetFormat),
        size: processedBuffer.length,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          colorspace: metadata.space,
          hasAlpha: metadata.hasAlpha,
        },
      };
    } catch (error) {
      this.logger.error(`File processing error: ${(error as Error).message}`);
      throw new Error(`Failed to process file: ${(error as Error).message}`);
    }
  }

  /**
   * Extracts metadata from a file without modifying it.
   *
   * @param fileBuffer - File content
   * @returns Object with width, height, format, etc.
   */
  async extractMetadata(fileBuffer: Buffer): Promise<Record<string, any>> {
    try {
      const metadata = await sharp(fileBuffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        colorspace: metadata.space,
        hasAlpha: metadata.hasAlpha,
        density: metadata.density,
        channels: metadata.channels,
        depth: metadata.depth,
        isProgressive: metadata.isProgressive,
      };
    } catch (error) {
      this.logger.error(`Metadata extraction error: ${(error as Error).message}`);
      return {};
    }
  }

  /**
   * Generates a thumbnail from a file.
   *
   * @param fileBuffer - File content
   * @param width - Thumbnail width
   * @param height - Thumbnail height
   * @returns Buffer containing the thumbnail
   */
  async generateThumbnail(fileBuffer: Buffer, width: number, height: number): Promise<Buffer> {
    try {
      return await sharp(fileBuffer)
        .resize(width, height, {
          fit: 'cover',
          withoutEnlargement: true,
        })
        .webp({ quality: 70, effort: 4 })
        .toBuffer();
    } catch (error) {
      this.logger.error(`Thumbnail generation error: ${(error as Error).message}`);
      throw new Error(`Failed to generate thumbnail: ${(error as Error).message}`);
    }
  }

  /**
   * Maps file format to MIME type.
   */
  private getMimeType(format: string): string {
    const mimeMap: Record<string, string> = {
      webp: 'image/webp',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      avif: 'image/avif',
      tiff: 'image/tiff',
    };
    return mimeMap[format.toLowerCase()] || 'application/octet-stream';
  }

  private shouldTransform(options: ProcessingOptions): boolean {
    return Boolean(
      options.convertToFormat ||
      options.maxWidth ||
      options.maxHeight ||
      options.quality ||
      options.thumbnail,
    );
  }

  private extensionFromMime(mimeType?: string): string {
    if (!mimeType) return 'bin';

    const extensionMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };

    return extensionMap[mimeType] || 'bin';
  }
}
