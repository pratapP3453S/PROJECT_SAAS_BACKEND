# Upload Feature — Developer Guide

The upload feature is a class-based file pipeline. The HTTP layer (controller)
only marshals requests; orchestration, validation, processing, audit, signing,
and storage are separate injectable classes. Five backends are wired and
production-ready: **Local, AWS S3, Cloudflare R2, Cloudinary, ImageKit**.

It is **closed for modification, open for extension**: adding a new backend
means writing a new provider class and adding one entry to the
`PROVIDER_CLASS_REGISTRY` map in `api/v1/upload-v1.module.ts`. Nothing else changes.

---

## Layer map

```
modules/upload/
├── domain/
│   ├── constants/upload.constants.ts            # DI tokens (STORAGE_PROVIDER, …)
│   ├── entities/upload.entity.ts                # UploadResult, MoveFileResult, isSensitiveType
│   ├── interfaces/
│   │   ├── storage-provider.interface.ts        # IStorageProvider port
│   │   ├── presigned-url.interface.ts           # IPresignedUrl{Provider,Service}
│   │   ├── file-validator.interface.ts          # IFileValidator
│   │   ├── file-processor.interface.ts          # IFileProcessor
│   │   └── audit-logger.interface.ts            # IAuditLogger
│   └── services/
│       ├── file-validator.service.ts            # MIME + size + magic-bytes
│       └── file-processor.service.ts            # Sharp pipeline (pass-through for non-images)
│
├── infrastructure/
│   ├── config/
│   │   ├── upload-config.interface.ts           # typed config shapes
│   │   └── upload-config.service.ts             # env loader + FileTypeRegistry
│   ├── providers/
│   │   ├── base-storage.provider.ts             # shared helpers
│   │   ├── local-storage.provider.ts            # Local FS + HMAC presigned URLs
│   │   ├── s3-storage.provider.ts               # AWS S3
│   │   ├── cloudflare-r2-storage.provider.ts    # extends S3 with R2 endpoint
│   │   ├── cloudinary-storage.provider.ts       # Cloudinary upload_stream + signed POST
│   │   └── imagekit-storage.provider.ts         # ImageKit SDK + HMAC-SHA1 tokens
│   ├── signing/local-signed-url.service.ts      # HMAC signer/verifier (local only)
│   ├── audit/audit-logger.service.ts            # in-memory sink (pluggable)
│   └── multer/multer.factory.ts                 # Multer options factory
│
├── application/
│   └── use-cases/
│       ├── upload.service.ts                    # validate → process → encrypt → save
│       └── presigned-url.service.ts             # facade over active provider's signing
│
├── api/
│   └── v1/
│       ├── controllers/
│       │   ├── upload.controller.ts             # POST /v1/upload/:type and friends
│       │   └── local-direct.controller.ts       # PUT /upload/local/direct (signed)
│       ├── dto/upload.dto.ts                    # Commit, Remove, Presigned, Complete, Download
│       └── upload-v1.module.ts                  # forRoot() registers the active provider
│
└── upload.module.ts                             # aggregator (calls UploadV1Module.forRoot())
```

`LocalDirectUploadController` is intentionally NOT URI-versioned (its path is a
bearer credential).

---

## Architecture in one picture

```
┌─────────────────────────────────────────────────────────────────────┐
│  HTTP                                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ UploadController                                            │    │
│  │  POST   /v1/upload/:type                  (server-mediated) │    │
│  │  POST   /v1/upload/commit                                   │    │
│  │  DELETE /v1/upload/remove                                   │    │
│  │  POST   /v1/upload/presigned-url          (direct init)     │    │
│  │  POST   /v1/upload/presigned-url/complete (verify direct)   │    │
│  │  POST   /v1/upload/download-url           (signed download) │    │
│  └────────────┬─────────────────────────────────┬──────────────┘    │
│               │                                 │                   │
│  ┌────────────▼─────────────┐    ┌──────────────▼──────────────┐    │
│  │ UploadService            │    │ PresignedUrlService         │    │
│  │ (application/use-cases)  │    │ (thin facade)               │    │
│  └────────────┬─────────────┘    └──────────────┬──────────────┘    │
│               │                                 │                   │
│  ┌────────────┴───────────┬─────────────────────┴────────────┐      │
│  │ FileValidator | FileProcessor | EncryptionService | Audit │      │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  DI tokens (domain/constants)                                       │
│   STORAGE_PROVIDER         → IStorageProvider     (active backend)  │
│   PRESIGNED_URL_PROVIDER   → IPresignedUrlProvider (same class)     │
│                                                                     │
│  Provider registry (api/v1/upload-v1.module.ts)                     │
│   local      → LocalStorageProvider                                 │
│   s3         → S3StorageProvider                                    │
│   cloudflare → CloudflareR2StorageProvider                          │
│   cloudinary → CloudinaryStorageProvider                            │
│   imagekit   → ImageKitStorageProvider                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Every provider implements **both** `IStorageProvider` and `IPresignedUrlProvider`.

---

## File-type registry (production-ready)

`UploadConfigService.loadFileTypeRegistry()` ships these out of the box:

| Category       | MIME allow-list                                                                    | Size cap | Encrypted | Public | Processing            |
| -------------- | ---------------------------------------------------------------------------------- | -------: | --------- | ------ | --------------------- |
| `avatar`       | jpg, png, webp                                                                     |    5 MB | no        | yes    | WebP 512×512 q85      |
| `image`        | jpg, png, webp, gif, avif, heic, heif, bmp, tiff, svg                              |   25 MB | no        | yes    | WebP 4096×4096 q85    |
| `video`        | mp4, mpeg, mov, webm, avi, mkv, 3gp, 3g2, flv, wmv, ogv                            |  500 MB | no        | yes    | none (pass-through)   |
| `audio`        | mp3, m4a, wav, ogg, weba, aac, flac, wma, midi, opus                               |   50 MB | no        | yes    | none                  |
| `document`     | pdf, doc, docx, rtf, odt, txt, md, html                                            |   25 MB | yes       | no     | none                  |
| `spreadsheet`  | xls, xlsx, csv, ods, tsv                                                           |   25 MB | yes       | no     | none                  |
| `presentation` | ppt, pptx, odp, key                                                                |   50 MB | yes       | no     | none                  |
| `archive`      | zip, rar, 7z, tar, gz, bz2                                                         |  100 MB | yes       | no     | none (BYO scanner)    |
| `aadhar`       | jpg, png                                                                           |    5 MB | yes       | no     | WebP 1024×1024 q90    |
| `identity`     | jpg, png                                                                           |    5 MB | yes       | no     | WebP 1024×1024 q90    |
| `passport`     | jpg, png                                                                           |    5 MB | yes       | no     | WebP 1024×1024 q90    |

Per-category `maxFileSizeBytes` overrides the global `MAX_FILE_SIZE_MB`
ceiling. `FileValidatorService.validateSize(bytes, type)` picks the
narrower of the two.

Adding a new category is one entry in `loadFileTypeRegistry()`. The MIME
catalogues themselves are re-exported as `UPLOAD_FORMATS` so the multer
factory's default allow-list stays in sync.

---

## API flows

### 1. Server-mediated upload (works for every backend)

`POST /v1/upload/:type` (multipart/form-data, field `file`)

```
client → POST /v1/upload/:type
              │
              ▼
        Multer (field=file, max=MAX_FILE_SIZE_MB)
              │ writes raw bytes to ./uploads/temp/{uuid}{ext}
              ▼
        UploadController.upload()
              │ rejects empty body, rejects reserved type segments
              ▼
        UploadService.processFile()
              │ ① audit START
              │ ② FileValidator.validate (MIME, size, magic-bytes)
              │ ③ fs.readFile(rawPath) → Buffer
              │ ④ FileProcessor.process (Sharp pipeline; pass-through for non-images)
              │ ⑤ EncryptionService.encryptBuffer (if sensitive category)
              │ ⑥ STORAGE_PROVIDER.saveTemp(input)
              │ ⑦ delete raw Multer temp file
              │ ⑧ audit COMPLETE
              ▼
        201 { tempUrl, serverFileName, mimeType, size, isEncrypted }
```

Then promote with `POST /v1/upload/commit { filename, type }` once your DB
record points at it.

### 2. Direct browser → cloud upload (presigned)

```
① client                 ② cloud storage (S3 / R2 / Cloudinary / ImageKit)
   │                                      ▲
   ▼                                      │ direct PUT/POST (bytes)
   POST /v1/upload/presigned-url ────► server returns { url, formData?, fileKey }
   │
   ▼ (use the url + headers/formData)
   PUT/POST {url}    ◀──── bytes go straight to storage, server never touches them
   │
   ▼
   POST /v1/upload/presigned-url/complete  { fileKey, type, size, providerReceipt }
                                  │
                                  ▼
   server: STORAGE_PROVIDER.head(fileKey) → verify exists & size matches
   200 OK { exists, size, contentType, url }
```

The `complete` step is **mandatory**. The server is offline during step ②, so
without it a malicious client can claim "I uploaded X" without ever doing so.

### 3. Signed download

`POST /v1/upload/download-url { fileKey, expirySeconds? }` → time-limited URL the
browser can fetch directly. Used for private categories (`document`, `aadhar`,
`identity`, `passport`, etc.).

### Commit accepts both temp shapes

`POST /v1/upload/commit` accepts either `{ filename, type }` (server-mediated
upload — leaf returned in `tempUrl`) or `{ fileKey, type }` (presigned upload —
the full key returned by `/presigned-url` and echoed by `/complete`). The
active provider detects which form it received and resolves the source object
accordingly. Both forms collapse to the same flat permanent shape, so a
presigned aadhar upload at `uploads/temp/u-7/aadhar/abc.png` ends up at
`uploads/aadhar/abc.png` — exactly the layout server-mediated uploads produce.
Persisted URLs never depend on which upload flow created them.

### 4. Local provider — HMAC-signed presigned URLs

The local provider implements the same presigned-URL contract as S3/R2/Cloudinary/ImageKit.
The signature is HMAC-SHA256 over `(method, key, expire, contentType, maxSize)`,
keyed by `UPLOAD_LOCAL_SIGNING_SECRET` (or `JWT_SECRET` as fallback).

```
client → POST /v1/upload/presigned-url    → server returns
            {
              url:    "/upload/local/direct?key=…&expire=…&ct=…&max=…&sig=…",
              method: "PUT",
              fileKey, expiresAt, headers: { Content-Type: "image/jpeg" }
            }

client → PUT  {url}                       → bytes go to LocalDirectUploadController
            └─ NO Authorization header needed; signature IS the auth
            └─ Body: raw bytes (NOT multipart). Content-Type must match `ct`.

client → POST /v1/upload/presigned-url/complete → server verifies file landed,
                                                  returns {exists, size, url}
```

Why a separate `LocalDirectUploadController`?
- The traditional `POST /v1/upload/:type` endpoint stays exactly as before — Multer,
  validation, processing, encryption, audit — for callers who want a
  one-shot server-side pipeline.
- The new `PUT /upload/local/direct` endpoint accepts raw bytes only when the
  signature checks out. It mirrors S3's PUT-style presigned URL behaviour.
- Same key shape (`uploads/temp/{userId}/{type}/{uuid}{ext}`) means
  `cleanupTemp` and the `commit` step work for both flows.
- `assertWritableKey()` refuses any key not under `uploads/temp/`, so signed
  URLs cannot bypass the temp/commit ladder.
- DELETE is intentionally NOT signed — local deletes still go through the
  authenticated `DELETE /v1/upload/remove`.

---

## Configuration

All configuration is environment-driven; the active provider's required keys
are validated at boot inside `UploadConfigService.validateActiveProvider()`.
See `.env.example` for the full reference. Quick map:

| Provider     | Env vars                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `local`      | `UPLOAD_DEST`, `UPLOAD_LOCAL_SIGNING_SECRET` (or falls back to `JWT_SECRET`)                                  |
| `s3`         | `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_S3_ENDPOINT`, `AWS_S3_PUBLIC_URL`, `AWS_S3_FORCE_PATH_STYLE`, `AWS_S3_TEMP_PREFIX`, `AWS_S3_PERMANENT_PREFIX` |
| `cloudflare` | `CF_ACCOUNT_ID`, `CF_ACCESS_KEY_ID`, `CF_SECRET_ACCESS_KEY`, `CF_BUCKET_NAME`, optional `CF_PUBLIC_URL`, `CF_ENDPOINT`                                                                                  |
| `cloudinary` | Either `CLOUDINARY_URL`, or `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`. Optional `CLOUDINARY_FOLDER`, `CLOUDINARY_UPLOAD_PRESET`, `CLOUDINARY_USE_SIGNED`, `CLOUDINARY_SECURE` |
| `imagekit`   | `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`, optional `IMAGEKIT_FOLDER`, `IMAGEKIT_USE_UNIQUE_FILENAME`                                                                       |

Cross-provider switches: `MAX_FILE_SIZE_MB`, `UPLOAD_TEMP_RETENTION_HOURS`,
`UPLOAD_PRESIGNED_EXPIRY`, `UPLOAD_ENABLE_PRESIGNED_URLS`, `UPLOAD_ENABLE_ENCRYPTION`,
`UPLOAD_ENABLE_AUDIT`, `UPLOAD_PUBLIC_BASE_URL`.

---

## Extension points

### Add a new storage backend

1. Create `infrastructure/providers/my-backend-storage.provider.ts`:
   ```ts
   @Injectable()
   export class MyBackendStorageProvider extends BaseStorageProvider
     implements IPresignedUrlProvider {
     constructor(private readonly cfg: UploadConfigService) { super('MyBackend'); }
     async saveTemp(input)       { /* … */ }
     async commitToPermanent()   { /* … */ }
     async delete(fileUrl)       { /* … */ }
     async cleanupTemp(hours?)   { /* … */ }
     async head(key)             { /* … */ }
     async generateUploadUrl()   { /* … */ }
     async generateDownloadUrl() { /* … */ }
     async generateDeleteUrl()   { /* … */ }
     async completePresignedUpload(input) { /* … */ }
   }
   ```

2. In `api/v1/upload-v1.module.ts` add ONE line to `PROVIDER_CLASS_REGISTRY`:
   ```ts
   const PROVIDER_CLASS_REGISTRY = {
     local: LocalStorageProvider,
     s3: S3StorageProvider,
     // ...
     mybackend: MyBackendStorageProvider,   // ← only edit
   };
   ```

3. Add the provider's env block to `.env.example` and document required keys
   in `UploadConfigService.validateActiveProvider()`.

`UploadController`, `UploadService`, `PresignedUrlService` and every other file
stay untouched. That is the OCP guarantee.

### Add a new upload category

Add an entry to `UploadConfigService.loadFileTypeRegistry()` with the MIME
allow-list, per-category size cap, processing pipeline, encryption flag,
retention, and access policy. If the category covers a new format family
(e.g. fonts), also add the MIME types to `UPLOAD_FORMATS` so the multer
factory accepts them by default.

### Pluggable validation / processing / audit

`FileValidatorService`, `FileProcessorService`, `AuditLoggerService` each
implement an interface (`IFileValidator`, `IFileProcessor`, `IAuditLogger`).
Swap implementations by editing one entry in the v1 module providers — no consumer
changes.

---

## Risk notes

- **Presigned-URL `complete` is not optional.** Never write a file URL to the DB
  on the basis of a client claim alone — always call `/complete` first so the
  storage backend confirms the bytes arrived.
- **Per-category size caps are enforced by `FileValidatorService`, not Multer.**
  Multer's `limits.fileSize` is set to the GLOBAL ceiling so all categories pass
  through; the per-category override is checked inside the validator. If you
  shrink the global ceiling below your largest category cap, you'll lock yourself
  out of that category's full range.
- **Archive contents are not scanned.** Categories accept archive uploads as
  opaque bytes. Hook `IMalwareScanner` into `FileValidatorService.validate()`
  if your threat model requires it.
- **Cloudinary/ImageKit transcode media.** `head()` size may differ from what
  the client uploaded; size verification uses a tolerance window.
- **Local mode in production:** disk-backed uploads don't survive container
  restarts. Use a mounted volume or switch to a cloud provider.
- **AES-256 keys must remain stable.** Re-keying breaks all previously
  encrypted files unless you build a re-encryption job.
- **R2 has no default public URL.** Configure `CF_PUBLIC_URL` (custom domain or
  `r2.dev` URL) or always use signed download URLs.
- **Video / audio are NOT transcoded.** They pass through bit-for-bit. Plug an
  ffmpeg-based `IFileProcessor` implementation in if/when that need arises.
