# Upload Feature Developer Guide

## Purpose

The upload feature is a class-based file pipeline. The controller handles HTTP only; the service orchestrates the flow; validation, processing, audit logging, presigned URL generation, and storage are separate injectable classes.

The design goal is open for extension and closed for core edits. New storage backends should be added by implementing the storage contract and changing provider binding/config, not by rewriting controller or service logic.

## Active Runtime Classes

- `upload.controller.ts`: authenticated API routes.
- `upload.service.ts`: orchestration for upload, commit, delete, and temp cleanup.
- `config/upload-config.service.ts`: provider selection and upload-type rules.
- `services/file-validator.service.ts`: size, MIME, and magic-byte validation.
- `services/file-processor.service.ts`: image transformation and pass-through processing for documents.
- `services/audit-logger.service.ts`: non-blocking operation audit trail.
- `services/presigned-url.service.ts`: direct-upload URL contract.
- `providers/local-storage.provider.ts`: active local disk provider.
- `providers/s3-storage.provider.ts`: adapter slot for AWS S3 implementation.
- `providers/cloudflare-r2-storage.provider.ts`: adapter slot for Cloudflare R2 implementation.

## API Flow

### API-Proxy Upload

`POST /upload/:type`

1. `JwtAuthGuard` authenticates the user.
2. Multer writes the raw file to local temp disk.
3. `UploadController` rejects missing file bodies.
4. `UploadService.processFile()` starts an audit entry.
5. `FileValidatorService` validates:
   - configured upload type,
   - MIME type,
   - file size,
   - magic bytes from the raw file.
6. `FileProcessorService` transforms images when type config has processing rules.
7. Documents or unprocessed types pass through unchanged.
8. `EncryptionService` encrypts the processed buffer when `UploadConfigService.shouldEncrypt(type)` is true.
9. `IStorageProvider.saveTemp()` stores the final bytes in temp storage.
10. The raw Multer file is deleted.
11. The response returns `tempUrl`, `serverFileName`, `mimeType`, `size`, and `isEncrypted`.

### Commit

`POST /upload/commit`

1. Controller validates `CommitFileDto`.
2. `UploadService.commitFile()` validates the upload type exists.
3. `IStorageProvider.commitToPermanent(filename, type)` promotes the file.
4. Local storage moves from `uploads/temp/{filename}` to `uploads/{type}/{filename}`.
5. The response returns `permanentUrl` and `serverFileName`.

The caller owns DB state changes around this flow. Usually:

1. Upload file and store `tempUrl`.
2. Create or update the business record.
3. Commit file.
4. Store `permanentUrl` and clear `tempUrl`.

### Delete

`DELETE /upload/remove`

1. Controller validates `RemoveFileDto`.
2. `UploadService.removeFile()` delegates deletion to the storage provider.
3. Providers return `false` for missing files.
4. Controller maps missing files to `ERR_FILE_NOT_FOUND`.

### Direct Upload URL

`POST /upload/presigned-url`

This endpoint creates a provider-specific direct-upload contract.

- For `local`, it returns the normal API upload route because local disk cannot issue object-store signed URLs.
- For S3 or R2, implement provider-specific signing inside `PresignedUrlService` or a dedicated adapter without changing `UploadController` or `UploadService`.

## Extension Points

### Storage Provider

Implement `IStorageProvider`:

- `saveTemp(input)`
- `commitToPermanent(filename, type)`
- `delete(fileUrl)`
- `cleanupTemp(olderThanHours)`

Then bind it through `STORAGE_PROVIDER` in `upload.module.ts`. The service consumes only the interface.

### File Type

Add or update file rules in `UploadConfigService.loadFileTypeRegistry()`:

- allowed MIME types,
- processing rules,
- encryption flag,
- public/private access,
- retention expectations.

### Processing

Image behavior belongs in `FileProcessorService`. Storage providers must not resize, convert, or encrypt files.

### Validation

Validation belongs in `FileValidatorService`. Add virus scanning or deeper document checks behind a validator interface rather than inside the controller.

### Audit

Audit logging belongs in `AuditLoggerService`. It must never fail the main upload flow.

## Current Upload Types

- `avatar`: public image, converted to WebP, resized to 512x512 max, not encrypted.
- `document`: private document, no image conversion, encrypted.
- `aadhar`: private image, converted to WebP, encrypted.
- `identity`: private image, converted to WebP, encrypted.
- `passport`: private image, converted to WebP, encrypted.

## Provider Migration Path

To move from local disk to S3 or Cloudflare R2:

1. Install the provider SDK.
2. Implement the adapter in `providers/s3-storage.provider.ts` or `providers/cloudflare-r2-storage.provider.ts`.
3. Implement signing in `PresignedUrlService` or delegate signing to a provider-specific signer class.
4. Add provider credentials to config and environment validation.
5. Bind the provider in `upload.module.ts`.
6. Set `UPLOAD_PROVIDER`.
7. Verify upload, commit, delete, cleanup, and presigned-url behavior.

No controller or orchestration service logic should need to change.

## Risk Notes

- API-proxy uploads still use Multer because the server must receive the bytes before local storage or server-side processing.
- Direct object-store uploads bypass server-side processing unless you add an async processing job after upload completion.
- Temp file and DB record consistency is caller-owned. Failed DB writes after upload can leave temp files until cleanup.
- Encrypted files require the same `IMAGE_ENCRYPTION_KEY` to decrypt later.
- Do not let storage providers accept path traversal. Local storage normalizes filenames and managed paths.
- Placeholder S3/R2 providers fail loudly until real SDK implementations are installed.

