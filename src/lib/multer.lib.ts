import { HttpException, HttpStatus } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * multer.lib — Multer middleware factory functions.
 *
 * Responsibility: Builds Multer Options objects (diskStorage + fileFilter + limits)
 * that are consumed by @UseInterceptors(FileInterceptor('file', options)).
 * Centralizes upload configuration so all endpoints use the same rules.
 *
 * ALLOWED_IMAGE_TYPES    : jpeg, jpg, png, webp, gif — accepted by image endpoints.
 * ALLOWED_DOCUMENT_TYPES : pdf, doc, docx — accepted by document endpoints.
 * ALLOWED_TYPES          : union of both — default for createUploadMiddleware.
 *
 * createUploadMiddleware(destination, options):
 *  Returns a Multer Options object with:
 *  - diskStorage: writes files to `destination` with UUID-based filenames.
 *    UUID + original extension prevents filename collisions and hides real names.
 *  - fileFilter: rejects disallowed MIME types with 415 ERR_INVALID_FILE_TYPE.
 *  - limits.fileSize: maxSizeMB * 1024² (default 10 MB).
 *  Also ensures the destination directory exists before accepting files.
 *
 * createImageUploadMiddleware(destination, maxSizeMB?):
 *  Shorthand for createUploadMiddleware restricted to ALLOWED_IMAGE_TYPES.
 *  Used for avatar uploads where documents should not be accepted.
 *
 * Used by: UploadController via FileInterceptor + createUploadMiddleware()
 */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];

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
              message: `File type "${file.mimetype}" is not allowed. Allowed types: ${allowedTypes.join(', ')}.`,
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
