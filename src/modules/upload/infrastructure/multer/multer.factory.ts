import { HttpException, HttpStatus } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UPLOAD_FORMATS } from '../config/upload-config.service';

/**
 * multer.factory — Multer middleware factory functions.
 *
 * Layer: infrastructure/multer — adapter for Express's `multer` body parser.
 * Used by the upload controller via @UseInterceptors(FileInterceptor(..)).
 *
 * Responsibility: Builds Multer Options objects (diskStorage + fileFilter +
 * limits). Centralises upload settings so all multipart endpoints behave
 * identically.
 *
 * The default allow-list spans EVERY supported MIME type across every
 * category (images, video, audio, docs, spreadsheets, presentations,
 * archives). The per-category MIME filter is enforced LATER by
 * FileValidatorService against the registry — Multer just guarantees the
 * file type is at least known to the system.
 *
 * createUploadMiddleware(destination, options):
 *  - diskStorage: writes files to `destination` with UUID-based filenames.
 *    UUID + original extension prevents filename collisions and hides real names.
 *  - fileFilter: rejects MIME types outside the supplied allow-list with
 *    415 ERR_INVALID_FILE_TYPE.
 *  - limits.fileSize: maxSizeMB * 1024² (default 10 MB).
 *  - Ensures the destination directory exists before accepting files.
 *
 * createImageUploadMiddleware(destination, maxSizeMB?):
 *  Shorthand restricted to image MIME types only — useful for endpoints that
 *  should never accept non-image content.
 *
 * Used by: UploadController via FileInterceptor + createUploadMiddleware()
 */

const ALLOWED_TYPES = [...UPLOAD_FORMATS.all];
const ALLOWED_IMAGE_TYPES = [...UPLOAD_FORMATS.image];

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createUploadMiddleware(
  destination: string,
  options: {
    maxSizeMB?: number;
    allowedTypes?: string[];
  } = {},
): MulterOptions {
  const { maxSizeMB = 10, allowedTypes = ALLOWED_TYPES } = options;

  ensureDir(destination);

  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        ensureDir(destination);
        cb(null, destination);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${uuidv4()}${ext}`;
        cb(null, uniqueName);
      },
    }),
    fileFilter: (
      _req: Express.Request,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      if (!allowedTypes.includes(file.mimetype)) {
        cb(
          new HttpException(
            {
              name: 'InvalidFileTypeError',
              code: 'ERR_INVALID_FILE_TYPE',
              message: `File type "${file.mimetype}" is not allowed.`,
            },
            HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          ),
          false,
        );
        return;
      }
      cb(null, true);
    },
    limits: {
      fileSize: maxSizeMB * 1024 * 1024,
    },
  };
}

export function createImageUploadMiddleware(destination: string, maxSizeMB = 5): MulterOptions {
  return createUploadMiddleware(destination, {
    maxSizeMB,
    allowedTypes: ALLOWED_IMAGE_TYPES,
  });
}
