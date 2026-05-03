# Lib Layer Developer Guide

## Purpose

`src/lib` contains small infrastructure helpers that are not Nest providers. These helpers are imported by modules when a direct factory or adapter is simpler than dependency injection.

## Current Helpers

- `multer.lib.ts`: creates Multer options for file uploads.
- `redis.lib.ts`: Redis helper configuration.
- `index.ts`: exports helpers.

## Multer Upload Flow

1. A controller calls `createUploadMiddleware(destination, options)`.
2. The helper ensures the destination directory exists.
3. Multer writes files to disk using UUID filenames while preserving the original extension.
4. `fileFilter` rejects unsupported MIME types with `ERR_INVALID_FILE_TYPE`.
5. `limits.fileSize` enforces the configured max size.
6. The controller receives `Express.Multer.File` and delegates processing to a service.

## Dependencies

- `multer` disk storage.
- `uuid` for collision-resistant server filenames.
- `fs` and `path` for directory and file path handling.
- `HttpException` for consistent MIME rejection.

## Complexity And Risk

- Low complexity.
- MIME checking is not the same as content validation. Services should still validate or process files safely.
- Raw files are written to disk before conversion, so cleanup on service failure is important.
- Upload size defaults should align with `MAX_FILE_SIZE_MB` in config and endpoint-specific requirements.

## Adding Helpers

Keep helpers stateless where possible. If a helper needs config or lifecycle hooks, prefer a Nest provider in `shared` or a feature module.

