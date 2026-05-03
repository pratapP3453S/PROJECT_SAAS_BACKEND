import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { ApiError } from '../../../common/errors/api.error';
import { Errors } from '../../../common/constants/error.constants';
import { IFileValidator, ValidationError } from '../interfaces/file-validator.interface';
import { UploadConfigService } from '../config/upload-config.service';

/**
 * FileValidatorService — implements IFileValidator
 *
 * Validates files before processing/storage:
 * - File size compliance
 * - MIME type verification
 * - Content validation (magic bytes)
 * - Type-specific rules
 *
 * All errors are collected and returned as a list, allowing the controller
 * to decide whether to fail fast or accumulate errors.
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
   * 1. Validate MIME type
   * 2. Validate file size
   * 3. Validate content (magic bytes)
   *
   * @param file - Multer file object
   * @param uploadType - Upload type slug
   * @returns Empty array if valid, ValidationError[] otherwise
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

    // 2. Validate file size
    const sizeValid = await this.validateSize(file.size);
    if (!sizeValid) {
      const maxSizeMB = this.uploadConfig.getConfig().maxFileSize / (1024 * 1024);
      errors.push({
        code: 'FILE_TOO_LARGE',
        message: `File size exceeds maximum allowed (${maxSizeMB}MB)`,
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
   * Validates file size against configured limit.
   */
  async validateSize(fileSizeBytes: number): Promise<boolean> {
    const maxFileSize = this.uploadConfig.getConfig().maxFileSize;
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
   * Magic bytes (file signatures):
   *  JPEG: FF D8 FF
   *  PNG:  89 50 4E 47
   *  GIF:  47 49 46 (GIF87a or GIF89a)
   *  WebP: 52 49 46 46 ... 57 45 42 50
   *  PDF:  25 50 44 46
   *  ZIP:  50 4B 03 04
   *
   * @param fileBuffer - File content
   * @param expectedMimeType - Declared MIME type
   * @returns true if content matches MIME type
   */
  async validateContent(fileBuffer: Buffer, expectedMimeType: string): Promise<boolean> {
    if (!fileBuffer || fileBuffer.length < 4) {
      return false;
    }

    const magicBytes = fileBuffer.slice(0, 16);

    switch (expectedMimeType) {
      case 'image/jpeg':
        return magicBytes[0] === 0xff && magicBytes[1] === 0xd8 && magicBytes[2] === 0xff;

      case 'image/png':
        return (
          magicBytes[0] === 0x89 &&
          magicBytes[1] === 0x50 &&
          magicBytes[2] === 0x4e &&
          magicBytes[3] === 0x47
        );

      case 'image/gif':
        return magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46;

      case 'image/webp':
        return (
          magicBytes[0] === 0x52 &&
          magicBytes[1] === 0x49 &&
          magicBytes[2] === 0x46 &&
          magicBytes[3] === 0x46 &&
          magicBytes[8] === 0x57 &&
          magicBytes[9] === 0x45 &&
          magicBytes[10] === 0x42 &&
          magicBytes[11] === 0x50
        );

      case 'application/pdf':
        return (
          magicBytes[0] === 0x25 &&
          magicBytes[1] === 0x50 &&
          magicBytes[2] === 0x44 &&
          magicBytes[3] === 0x46
        );

      case 'application/zip':
      case 'application/x-zip-compressed':
        return (
          magicBytes[0] === 0x50 &&
          magicBytes[1] === 0x4b &&
          magicBytes[2] === 0x03 &&
          magicBytes[3] === 0x04
        );

      // If MIME type is not recognized, assume it's valid
      // (prevents false positives for less common formats)
      default:
        return true;
    }
  }

  /**
   * Throws ApiError if file validation fails.
   * Convenience method for controller use.
   *
   * @param file - Multer file object
   * @param uploadType - Upload type slug
   * @throws ApiError if validation fails
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
