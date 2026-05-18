import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { ApiError } from '../../../../core/exceptions/api.error';
import { Errors } from '../../../../shared/constants/error.constants';
import { IFileValidator, ValidationError } from '../interfaces/file-validator.interface';
import { UploadConfigService } from '../../infrastructure/config/upload-config.service';

/**
 * FileValidatorService — implements IFileValidator (domain service).
 *
 * Validates files before processing/storage:
 * - File size compliance (per-category override, falls back to global cap)
 * - MIME type verification
 * - Content validation (magic bytes)
 * - Type-specific rules
 *
 * Errors are collected and returned as a list, allowing the caller to decide
 * whether to fail fast or accumulate errors.
 *
 * Layer note: lives in `domain/services/` because the logic itself (file MUST
 * match its claimed MIME type, MUST be under N bytes, etc.) is pure business
 * rule — no infrastructure dependency beyond the config registry. The
 * UploadConfigService dependency is on configuration data, not storage I/O.
 */
@Injectable()
export class FileValidatorService implements IFileValidator {
  private readonly logger = new Logger(FileValidatorService.name);

  constructor(private readonly uploadConfig: UploadConfigService) {}

  /**
   * Validates a file against all rules for the given upload type.
   * Collects all validation errors before returning.
   *
   * Flow:
   * 1. Validate MIME type against the category's allow-list.
   * 2. Validate file size against the category's effective limit.
   * 3. Validate content magic bytes (for formats we recognise).
   */
  async validate(file: Express.Multer.File, uploadType: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // 1. Validate MIME type
    const mimeTypeValid = await this.validateMimeType(file.mimetype, uploadType);
    if (!mimeTypeValid) {
      errors.push({
        code: 'INVALID_MIME_TYPE',
        message: `MIME type "${file.mimetype}" is not allowed for ${uploadType}`,
        field: 'file',
      });
    }

    // 2. Validate file size — prefer per-category cap.
    const sizeValid = await this.validateSize(file.size, uploadType);
    if (!sizeValid) {
      const maxBytes = this.uploadConfig.getMaxFileSize(uploadType);
      const maxMB = Math.round(maxBytes / (1024 * 1024));
      errors.push({
        code: 'FILE_TOO_LARGE',
        message: `File size exceeds maximum allowed (${maxMB} MB for "${uploadType}")`,
        field: 'file',
      });
    }

    const fileBuffer =
      file.buffer ?? (file.path ? await this.readForValidation(file.path) : undefined);
    if (fileBuffer) {
      const contentValid = await this.validateContent(fileBuffer, file.mimetype);
      if (!contentValid) {
        errors.push({
          code: 'INVALID_FILE_CONTENT',
          message: `File content does not match declared MIME type`,
          field: 'file',
        });
      }
    }

    if (errors.length > 0) {
      this.logger.warn(
        `File validation failed for ${uploadType}: ${errors.map((e) => e.code).join(', ')}`,
      );
    }

    return errors;
  }

  /**
   * Validates file size against the configured limit.
   * `uploadType` is optional so callers without category context still get
   * the global ceiling check.
   */
  async validateSize(fileSizeBytes: number, uploadType?: string): Promise<boolean> {
    const maxFileSize = this.uploadConfig.getMaxFileSize(uploadType);
    return fileSizeBytes <= maxFileSize;
  }

  /**
   * Validates MIME type is allowed for the upload type.
   */
  async validateMimeType(mimeType: string, uploadType: string): Promise<boolean> {
    try {
      return this.uploadConfig.isAllowedMimeType(uploadType, mimeType);
    } catch (error) {
      this.logger.error(`Error validating MIME type: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Validates file content matches the declared MIME type using magic bytes.
   *
   * Magic bytes (file signatures) covered:
   *  JPEG: FF D8 FF
   *  PNG:  89 50 4E 47
   *  GIF:  47 49 46
   *  WebP: 52 49 46 46 ... 57 45 42 50
   *  AVIF/HEIC: 'ftyp' box check
   *  PDF:  25 50 44 46
   *  ZIP/Office/JAR: 50 4B 03 04
   *  RAR:  52 61 72 21 1A 07
   *  7z:   37 7A BC AF 27 1C
   *  GZIP: 1F 8B
   *  MP4/QuickTime: 'ftyp' box at offset 4
   *  MP3:  ID3 or FF FB
   *  WAV:  RIFF...WAVE
   *  OGG:  4F 67 67 53
   *  FLAC: 66 4C 61 43
   *
   * For unknown formats we default to true (better than false-positives that
   * block legitimate uploads). The MIME allow-list is the primary defence.
   *
   * @param fileBuffer - File content
   * @param expectedMimeType - Declared MIME type
   * @returns true if content matches MIME type (or format is unrecognised)
   */
  async validateContent(fileBuffer: Buffer, expectedMimeType: string): Promise<boolean> {
    if (!fileBuffer || fileBuffer.length < 4) {
      return false;
    }

    const m = fileBuffer.slice(0, 16);

    switch (expectedMimeType) {
      case 'image/jpeg':
        return m[0] === 0xff && m[1] === 0xd8 && m[2] === 0xff;

      case 'image/png':
        return m[0] === 0x89 && m[1] === 0x50 && m[2] === 0x4e && m[3] === 0x47;

      case 'image/gif':
        return m[0] === 0x47 && m[1] === 0x49 && m[2] === 0x46;

      case 'image/webp':
        return (
          m[0] === 0x52 && m[1] === 0x49 && m[2] === 0x46 && m[3] === 0x46 &&
          m[8] === 0x57 && m[9] === 0x45 && m[10] === 0x42 && m[11] === 0x50
        );

      case 'image/avif':
      case 'image/heic':
      case 'image/heif':
        // ISO Base Media File Format — 'ftyp' box at offset 4
        return m[4] === 0x66 && m[5] === 0x74 && m[6] === 0x79 && m[7] === 0x70;

      case 'application/pdf':
        return m[0] === 0x25 && m[1] === 0x50 && m[2] === 0x44 && m[3] === 0x46;

      // ZIP container (also covers DOCX/XLSX/PPTX/ODT/ODS/ODP — they're zipped XML)
      case 'application/zip':
      case 'application/x-zip-compressed':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      case 'application/vnd.oasis.opendocument.text':
      case 'application/vnd.oasis.opendocument.spreadsheet':
      case 'application/vnd.oasis.opendocument.presentation':
        return m[0] === 0x50 && m[1] === 0x4b && (m[2] === 0x03 || m[2] === 0x05 || m[2] === 0x07);

      case 'application/x-rar-compressed':
      case 'application/vnd.rar':
        return (
          m[0] === 0x52 && m[1] === 0x61 && m[2] === 0x72 && m[3] === 0x21 &&
          m[4] === 0x1a && m[5] === 0x07
        );

      case 'application/x-7z-compressed':
        return (
          m[0] === 0x37 && m[1] === 0x7a && m[2] === 0xbc && m[3] === 0xaf &&
          m[4] === 0x27 && m[5] === 0x1c
        );

      case 'application/gzip':
      case 'application/x-gzip':
        return m[0] === 0x1f && m[1] === 0x8b;

      case 'application/x-bzip2':
        return m[0] === 0x42 && m[1] === 0x5a && m[2] === 0x68;

      case 'video/mp4':
      case 'video/quicktime':
      case 'video/3gpp':
      case 'video/3gpp2':
        // 'ftyp' box at offset 4
        return m[4] === 0x66 && m[5] === 0x74 && m[6] === 0x79 && m[7] === 0x70;

      case 'video/webm':
      case 'audio/webm':
        // EBML header (Matroska/WebM): 1A 45 DF A3
        return m[0] === 0x1a && m[1] === 0x45 && m[2] === 0xdf && m[3] === 0xa3;

      case 'audio/mpeg':
        // ID3v2 tag ('ID3') or MPEG sync word (FF FB)
        return (m[0] === 0x49 && m[1] === 0x44 && m[2] === 0x33) || (m[0] === 0xff && (m[1] & 0xe0) === 0xe0);

      case 'audio/wav':
      case 'audio/x-wav':
        // RIFF...WAVE
        return (
          m[0] === 0x52 && m[1] === 0x49 && m[2] === 0x46 && m[3] === 0x46 &&
          m[8] === 0x57 && m[9] === 0x41 && m[10] === 0x56 && m[11] === 0x45
        );

      case 'audio/ogg':
      case 'video/ogg':
        return m[0] === 0x4f && m[1] === 0x67 && m[2] === 0x67 && m[3] === 0x53;

      case 'audio/flac':
      case 'audio/x-flac':
        return m[0] === 0x66 && m[1] === 0x4c && m[2] === 0x61 && m[3] === 0x43;

      // For text-based or less-common formats, fall back to MIME-only check.
      default:
        return true;
    }
  }

  /**
   * Throws ApiError if file validation fails.
   * Convenience method for controller use.
   */
  async validateOrThrow(file: Express.Multer.File, uploadType: string): Promise<void> {
    const errors = await this.validate(file, uploadType);
    if (errors.length > 0) {
      throw ApiError.fromDefinition(Errors.INVALID_FILE_TYPE);
    }
  }

  private async readForValidation(filePath: string): Promise<Buffer | undefined> {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      this.logger.warn(`Could not read file for content validation: ${(error as Error).message}`);
      return undefined;
    }
  }
}
