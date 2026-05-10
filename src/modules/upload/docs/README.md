# Upload Feature — Developer Guide

The upload feature is a class-based file pipeline. The HTTP layer (controller)
only marshals requests; orchestration, validation, processing, audit, signing,
and storage are separate injectable classes. Five backends are wired and
production-ready: **Local, AWS S3, Cloudflare R2, Cloudinary, ImageKit**.

It is **closed for modification, open for extension**: adding a new backend
means writing a new provider class and adding one entry to the
`PROVIDER_CLASS_REGISTRY` map in `upload.module.ts`. Nothing else changes.

---

## Architecture in one picture

```
┌─────────────────────────────────────────────────────────────────────┐
│  HTTP                                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ UploadController                                            │    │
│  │  POST   /upload/:type                  (server-mediated)    │    │
│  │  POST   /upload/commit                                      │    │
│  │  DELETE /upload/remove                                      │    │
│  │  POST   /upload/presigned-url          (direct upload init) │    │
│  │  POST   /upload/presigned-url/complete (verify direct)      │    │
│  │  POST   /upload/download-url           (signed downloads)   │    │
│  └────────────┬─────────────────────────────────┬──────────────┘    │
│               │                                 │                   │
│  ┌────────────▼─────────────┐    ┌──────────────▼──────────────┐    │
│  │ UploadService            │    │ PresignedUrlService         │    │
│  │  processFile/commit/...  │    │  (thin facade)              │    │
│  └────────────┬─────────────┘    └──────────────┬──────────────┘    │
│               │                                 │                   │
│  ┌────────────┴───────────┬─────────────────────┴────────────┐      │
│  │ FileValidator | FileProcessor | EncryptionService | Audit │      │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  DI tokens                                                          │
│   STORAGE_PROVIDER         → IStorageProvider     (active backend)  │
│   PRESIGNED_URL_PROVIDER   → IPresignedUrlProvider (same class)     │
│                                                                     │
│  Provider registry (UploadModule.forRoot)                           │
│   local      → LocalStorageProvider                                 │
│   s3         → S3StorageProvider                                    │
│   cloudflare → CloudflareR2StorageProvider                          │
│   cloudinary → CloudinaryStorageProvider                            │
│   imagekit   → ImageKitStorageProvider                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Class catalogue

| File | Class | Role |
|---|---|---|
| `upload.controller.ts` | `UploadController` | HTTP boundary; six endpoints, all behind `JwtAuthGuard`. |
| `upload.service.ts` | `UploadService` | Orchestrates validate → process → encrypt → store; commit, delete, cleanup. |
| `services/presigned-url.service.ts` | `PresignedUrlService` | Facade over the active `IPresignedUrlProvider`. Adds defaults + key construction. |
| `services/file-validator.service.ts` | `FileValidatorService` | Size, MIME whitelist, magic-byte content sniffing. |
| `services/file-processor.service.ts` | `FileProcessorService` | Sharp pipeline: rotate → resize → convert → compress. |
| `services/audit-logger.service.ts` | `AuditLoggerService` | Non-blocking audit trail; pluggable destinations. |
| `config/upload-config.service.ts` | `UploadConfigService` | Loads + validates env; per-type rule registry; fail-fast on missing keys. |
| `providers/base-storage.provider.ts` | `BaseStorageProvider` | Common helpers (logging, key/URL normalisation, sanitisation). |
| `providers/local-storage.provider.ts` | `LocalStorageProvider` | Local FS, atomic temp→permanent rename, HMAC-signed presigned URLs. |
| `services/local-signed-url.service.ts` | `LocalSignedUrlService` | HMAC-SHA256 signer/verifier for the local presigned flow (constant-time). |
| `controllers/local-direct.controller.ts` | `LocalDirectUploadController` | Public PUT/GET routes the signed URLs point at; signature is the auth. |
| `providers/s3-storage.provider.ts` | `S3StorageProvider` | AWS SDK v3, full presigned PUT/GET/DELETE + CDN URL. |
| `providers/cloudflare-r2-storage.provider.ts` | `CloudflareR2StorageProvider` | Extends S3 with R2 endpoint + path-style URLs. |
| `providers/cloudinary-storage.provider.ts` | `CloudinaryStorageProvider` | Cloudinary `upload_stream` + signed direct uploads. |
| `providers/imagekit-storage.provider.ts` | `ImageKitStorageProvider` | ImageKit SDK + HMAC-SHA1 token signing. |

Every provider implements **both** `IStorageProvider` and `IPresignedUrlProvider`.

---

## API flows

### 1. Server-mediated upload (works for every backend)

`POST /upload/:type` (multipart/form-data, field `file`)

```
client → POST /upload/:type
              │
              ▼
        Multer (field=file, max=MAX_FILE_SIZE_MB)
              │ writes raw bytes to ./uploads/temp/{uuid}{ext}
              ▼
        UploadController.upload()
              │ rejects empty body
              ▼
        UploadService.processFile()
              │ ① audit START
              │ ② FileValidator.validate (MIME, size, magic-bytes)
              │ ③ fs.readFile(rawPath) → Buffer
              │ ④ FileProcessor.process (Sharp pipeline)
              │ ⑤ EncryptionService.encryptBuffer (if sensitive type)
              │ ⑥ STORAGE_PROVIDER.saveTemp(input)
              │ ⑦ delete raw Multer temp file
              │ ⑧ audit COMPLETE
              ▼
        201 { tempUrl, serverFileName, mimeType, size, isEncrypted }
```

Then promote with `POST /upload/commit { filename, type }` once your DB
record points at it.

### 2. Direct browser → cloud upload (presigned)

```
① client                 ② cloud storage (S3 / R2 / Cloudinary / ImageKit)
   │                                      ▲
   ▼                                      │ direct PUT/POST (bytes)
   POST /upload/presigned-url ────► server returns { url, formData?, fileKey }
   │
   ▼ (use the url + headers/formData)
   PUT/POST {url}    ◀──── bytes go straight to storage, server never touches them
   │
   ▼
   POST /upload/presigned-url/complete  { fileKey, type, size, providerReceipt }
                                  │
                                  ▼
   server: STORAGE_PROVIDER.head(fileKey) → verify exists & size matches
   200 OK { exists, size, contentType, url }
```

The `complete` step is **mandatory**. The server is offline during step ②, so
without it a malicious client can claim "I uploaded X" without ever doing so.

### 3. Signed download

`POST /upload/download-url { fileKey, expirySeconds? }` → time-limited URL the
browser can fetch directly. Used for private types (`document`, `aadhar`,
`identity`, `passport`).

### Commit accepts both temp shapes

`POST /upload/commit` accepts either `{ filename, type }` (server-mediated
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
client → POST /upload/presigned-url       → server returns
            {
              url:    "/upload/local/direct?key=…&expire=…&ct=…&max=…&sig=…",
              method: "PUT",
              fileKey, expiresAt, headers: { Content-Type: "image/jpeg" }
            }

client → PUT  {url}                       → bytes go to LocalDirectUploadController
            └─ NO Authorization header needed; signature IS the auth
            └─ Body: raw bytes (NOT multipart). Content-Type must match `ct`.

client → POST /upload/presigned-url/complete → server verifies file landed,
                                               returns {exists, size, url}
```

Why a separate `LocalDirectUploadController`?
- The traditional `POST /upload/:type` endpoint stays exactly as before — Multer,
  validation, processing, encryption, audit — for callers who want a
  one-shot server-side pipeline.
- The new `PUT /upload/local/direct` endpoint accepts raw bytes only when the
  signature checks out. It mirrors S3's PUT-style presigned URL behaviour.
- Same key shape (`uploads/temp/{userId}/{type}/{uuid}{ext}`) means
  `cleanupTemp` and the `commit` step work for both flows.
- `assertWritableKey()` refuses any key not under `uploads/temp/`, so signed
  URLs cannot bypass the temp/commit ladder.
- DELETE is intentionally NOT signed — local deletes still go through the
  authenticated `DELETE /upload/remove`.

---

## Configuration

All configuration is environment-driven; the active provider's required keys
are validated at boot inside `UploadConfigService.validateActiveProvider()`.
See `.env.example` for the full reference. Quick map:

| Provider | Env vars |
|---|---|
| `local` | `UPLOAD_DEST`, `UPLOAD_LOCAL_SIGNING_SECRET` (or falls back to `JWT_SECRET`) |
| `s3` | `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_S3_ENDPOINT`, `AWS_S3_PUBLIC_URL`, `AWS_S3_FORCE_PATH_STYLE`, `AWS_S3_TEMP_PREFIX`, `AWS_S3_PERMANENT_PREFIX` |
| `cloudflare` | `CF_ACCOUNT_ID`, `CF_ACCESS_KEY_ID`, `CF_SECRET_ACCESS_KEY`, `CF_BUCKET_NAME`, optional `CF_PUBLIC_URL`, `CF_ENDPOINT` |
| `cloudinary` | Either `CLOUDINARY_URL`, or `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`. Optional `CLOUDINARY_FOLDER`, `CLOUDINARY_UPLOAD_PRESET`, `CLOUDINARY_USE_SIGNED`, `CLOUDINARY_SECURE` |
| `imagekit` | `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`, optional `IMAGEKIT_FOLDER`, `IMAGEKIT_USE_UNIQUE_FILENAME` |

Cross-provider switches: `MAX_FILE_SIZE_MB`, `UPLOAD_TEMP_RETENTION_HOURS`,
`UPLOAD_PRESIGNED_EXPIRY`, `UPLOAD_ENABLE_PRESIGNED_URLS`, `UPLOAD_ENABLE_ENCRYPTION`,
`UPLOAD_ENABLE_AUDIT`, `UPLOAD_PUBLIC_BASE_URL`.

---

## Extension points

### Add a new storage backend

1. Create `providers/my-backend-storage.provider.ts`:
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

2. In `upload.module.ts` add ONE line to `PROVIDER_CLASS_REGISTRY`:
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

### Add a new upload type

Add an entry to `UploadConfigService.loadFileTypeRegistry()` with the MIME
whitelist, processing pipeline, encryption flag, retention, and access policy.

### Pluggable validation / processing / audit

`FileValidatorService`, `FileProcessorService`, `AuditLoggerService` each
implement an interface (`IFileValidator`, `IFileProcessor`, `IAuditLogger`).
Swap implementations by editing one entry in the module providers — no consumer
changes.

---

## Risk notes

- **Presigned-URL `complete` is not optional.** Never write a file URL to the DB
  on the basis of a client claim alone — always call `/complete` first so the
  storage backend confirms the bytes arrived.
- **Cloudinary/ImageKit transcode media.** `head()` size may differ from what
  the client uploaded; size verification uses a tolerance window.
- **Local mode in production:** disk-backed uploads don't survive container
  restarts. Use a mounted volume or switch to a cloud provider.
- **AES-256 keys must remain stable.** Re-keying breaks all previously
  encrypted files unless you build a re-encryption job.
- **R2 has no default public URL.** Configure `CF_PUBLIC_URL` (custom domain or
  `r2.dev` URL) or always use signed download URLs.
