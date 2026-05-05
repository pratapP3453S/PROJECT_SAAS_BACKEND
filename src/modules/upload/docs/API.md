# Upload API Reference

This document lists every endpoint exposed by the **Upload Module**. All endpoints
require `Authorization: Bearer <access_token>`.

The upload feature supports two flows:

| Flow | When to use |
|---|---|
| **Server-mediated** (`POST /upload/:type` → `/commit`) | The server must process the file (resize, encrypt, validate magic bytes). Works for every backend, including local. |
| **Direct to storage** (`POST /upload/presigned-url` → client uploads → `/presigned-url/complete`) | The client uploads the bytes directly to S3 / R2 / Cloudinary / ImageKit. The server never sees the bytes. Best for large files and high throughput. |

Both flows end with a row in your DB pointing at the file's **permanent URL**.

---

## 1. Server-mediated upload — Stage 1

`POST /upload/:type` (multipart/form-data)

Path: `:type` ∈ `avatar | document | aadhar | identity | passport`.

### Constraints
- Field name: `file`
- Max size: `MAX_FILE_SIZE_MB` (default 10 MB; enforced by both Multer and `FileValidatorService`).
- Allowed types: per `UploadConfigService` registry. Avatar/Aadhar/Identity/Passport accept only `image/jpeg`, `image/png`, `image/webp`. Document accepts `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- Image processing: per type. Avatar → 512×512 WebP @85; sensitive types → 1024×1024 WebP @90.
- Encryption: sensitive types are AES-256-CBC encrypted before storage.

### Response 201
```json
{
  "success": true, "statusCode": 201,
  "message": "File uploaded successfully. Use POST /upload/commit to promote to permanent storage.",
  "data": {
    "tempUrl": "/uploads/temp/abc.webp",
    "serverFileName": "abc.webp",
    "originalFileName": "photo.jpg",
    "mimeType": "image/webp",
    "size": 45678,
    "isEncrypted": false
  }
}
```

Errors: `400 ERR_FILE_NOT_UPLOADED`, `413 ERR_FILE_TOO_LARGE`, `415 ERR_INVALID_FILE_TYPE`.

---

## 2. Commit — Stage 2

`POST /upload/commit`

Promotes a temp file to its permanent location for the type.

```json
{ "filename": "abc.webp", "type": "avatar" }
```

Response 200
```json
{
  "success": true, "statusCode": 200,
  "message": "File committed to permanent storage.",
  "data": { "permanentUrl": "https://cdn.example.com/uploads/avatar/abc.webp", "serverFileName": "abc.webp" }
}
```

Errors: `404 ERR_FILE_NOT_FOUND`.

---

## 3. Delete

`DELETE /upload/remove`

Idempotent — returns `404` if the file is already gone.

```json
{ "fileUrl": "/uploads/temp/abc.webp" }
```

Response 200
```json
{ "success": true, "statusCode": 200, "message": "File deleted successfully.", "data": null }
```

---

## 4. Presigned upload URL — Direct flow Stage 1

`POST /upload/presigned-url` → returns a provider-specific URL the browser PUTs/POSTs to.

```json
{ "type": "avatar", "filename": "profile.png", "contentType": "image/png", "size": 524288, "method": "PUT" }
```

Response varies by provider; the shape is always `PresignedUrlResult`.

**S3 / R2** example:
```json
{
  "success": true, "statusCode": 200, "message": "Request completed successfully.",
  "data": {
    "url": "https://my-bucket.s3.us-east-1.amazonaws.com/uploads/temp/u-7/avatar/...?X-Amz-Algorithm=...",
    "method": "PUT",
    "expiresAt": 1735000000,
    "fileKey": "uploads/temp/u-7/avatar/abc.png",
    "headers": { "Content-Type": "image/png" }
  }
}
```

**Cloudinary** example:
```json
{
  "data": {
    "url": "https://api.cloudinary.com/v1_1/my-cloud/auto/upload",
    "method": "POST",
    "expiresAt": 1735000000,
    "fileKey": "uploads/temp/avatar/abc",
    "formData": {
      "public_id": "abc",
      "folder": "uploads/temp/avatar",
      "timestamp": "1734996400",
      "signature": "<sha1>",
      "api_key": "..."
    }
  }
}
```

**ImageKit** example:
```json
{
  "data": {
    "url": "https://upload.imagekit.io/api/v1/files/upload",
    "method": "POST",
    "expiresAt": 1735000000,
    "fileKey": "/uploads/temp/avatar/abc.png",
    "formData": {
      "token": "<uuid>",
      "expire": "1735000000",
      "signature": "<sha1>",
      "publicKey": "...",
      "fileName": "abc.png",
      "folder": "/uploads/temp/avatar"
    }
  }
}
```

**Local** returns the API-proxy descriptor (`url: "/upload/avatar"`, `mode: "api-proxy"`) so the same client code works in dev.

### Browser submission examples

PUT (S3/R2):
```js
await fetch(data.url, { method: 'PUT', headers: data.headers, body: file });
```

POST multipart (Cloudinary, ImageKit):
```js
const fd = new FormData();
Object.entries(data.formData).forEach(([k, v]) => fd.append(k, v));
fd.append('file', file);
await fetch(data.url, { method: 'POST', body: fd });
```

---

## 5. Complete presigned upload — Direct flow Stage 2 (REQUIRED)

`POST /upload/presigned-url/complete`

The server stats the object on the storage backend to confirm the upload arrived.
**Skip this and a malicious client can persist URLs that don't exist in storage.**

```json
{ "fileKey": "uploads/temp/u-7/avatar/abc.png", "type": "avatar", "size": 524288 }
```

Response 200
```json
{
  "success": true, "statusCode": 200,
  "data": {
    "exists": true,
    "size": 524288,
    "contentType": "image/png",
    "url": "https://my-bucket.s3.us-east-1.amazonaws.com/uploads/temp/u-7/avatar/abc.png"
  }
}
```

Errors: `404 ERR_FILE_NOT_FOUND` (no object at the key), `400 ERR_BAD_REQUEST` (size mismatch beyond tolerance).

After this, the normal `POST /upload/commit { filename, type }` promotes the
temp object to its permanent prefix on the same backend.

---

## 6. Signed download URL

`POST /upload/download-url`

Returns a time-limited URL the browser can fetch directly. Use for private
types (`document`, `aadhar`, `identity`, `passport`) so the API never streams
bytes.

```json
{ "fileKey": "uploads/document/u-7/contract.pdf", "expirySeconds": 600 }
```

Response 200 — provider-specific signed URL valid for `expirySeconds` seconds.

---

## End-to-end choreography

### Server-mediated avatar update
```
POST /upload/avatar           → tempUrl
PATCH /users/me {avatarUrl: tempUrl}        # write tempUrl to user row
POST /upload/commit {filename, type}        → permanentUrl
PATCH /users/me {avatarUrl: permanentUrl}   # swap to permanent
```

### Direct-to-S3 avatar update
```
POST /upload/presigned-url {type, filename, contentType}     → {url, fileKey, headers}
PUT  {url} (browser)                                          → 200 (bytes go to S3)
POST /upload/presigned-url/complete {fileKey, type, size}    → {url}
PATCH /users/me {avatarUrl: url}                              # write permanent URL
```

For sensitive private files, end the flow with `POST /upload/commit` to move
from `temp/` to the permanent prefix; the persisted URL stays the cloud URL.
