# Upload API Reference

This document lists every endpoint exposed by the **Upload Module**. All endpoints
(except the HMAC-signed local-direct routes) require `Authorization: Bearer <access_token>`.

> **Diagnostic envelope.** Every JSON response in this module — success and error —
> ships with `request`, `timing`, and `server` fields alongside `data` / `error`.
> Stage 1 below is shown in full to demonstrate the canonical shape. All other
> response examples in this file omit `request` / `timing` / `server` /
> `timestamp` / `path` for brevity — they are always present. See the
> [Root API Guide → Response Format](../../../../docs/API.md#response-format)
> for field definitions.

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

### Response 201 — full envelope (canonical shape)
```json
{
  "success": true,
  "statusCode": 201,
  "message": "File uploaded successfully. Use POST /upload/commit to promote to permanent storage.",
  "data": {
    "tempUrl": "/uploads/temp/abc.webp",
    "serverFileName": "abc.webp",
    "originalFileName": "photo.jpg",
    "mimeType": "image/webp",
    "size": 45678,
    "isEncrypted": false
  },
  "request": {
    "requestId": "9b2c1f74-3b4a-4ed0-91f8-2a1c1c1c4a99",
    "method": "POST",
    "path": "/api/v1/upload/avatar",
    "apiVersion": "v1",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0 ..."
  },
  "timing": {
    "totalMs": 187.42,
    "dbMs": 12.7,    "dbQueries": 2,
    "cacheMs": 1.4,  "cacheOps": 1, "cacheHits": 0, "cacheMisses": 1,
    "externalMs": 0, "externalCalls": 0
  },
  "server": {
    "hostname": "app-pod-7c4f",
    "pid": 1234,
    "env": "production",
    "nodeVersion": "v22.18.0",
    "appVersion": "1.0.0"
  },
  "timestamp": "2026-05-10T22:41:03.182Z",
  "path": "/api/v1/upload/avatar"
}
```

> All subsequent endpoint examples in this file omit the `request` / `timing` /
> `server` / `timestamp` / `path` fields for readability. They are always
> present with the same shape.

Errors: `400 ERR_FILE_NOT_UPLOADED`, `413 ERR_FILE_TOO_LARGE`, `415 ERR_INVALID_FILE_TYPE`.

---

## 2. Commit — Stage 2

`POST /upload/commit`

Promotes a temp file to its permanent location for the type. Accepts **either**
shape depending on which upload flow produced the temp file:

```json
// Server-mediated commit (after POST /upload/:type)
{ "filename": "abc.webp", "type": "avatar" }
```

```json
// Presigned commit (after POST /upload/presigned-url + PUT + /complete)
{ "fileKey": "uploads/temp/u-7/aadhar/abc.png", "type": "aadhar" }
```

`fileKey` takes precedence when both are provided. The active provider detects
which form it received and resolves the source object accordingly. Both forms
land the file at the **same** permanent shape:

```
local:      uploads/{type}/{filename}
s3 / r2:    {permanentPrefix}/{type}/{filename}
cloudinary: {folder}/{type}/{public_id}
imagekit:   /{folder}/{type}/{filename}
```

Response 200
```json
{
  "success": true, "statusCode": 200,
  "message": "File committed to permanent storage.",
  "data": { "permanentUrl": "https://cdn.example.com/uploads/aadhar/abc.png", "serverFileName": "abc.png" }
}
```

Errors: `400 ERR_BAD_REQUEST` (neither field provided), `404 ERR_FILE_NOT_FOUND`.

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

**Local** (HMAC-signed) example:
```json
{
  "data": {
    "url": "/upload/local/direct?key=uploads%2Ftemp%2Fu-7%2Favatar%2Fabc.png&expire=1735000000&ct=image%2Fpng&max=524288&sig=AbC123_-...",
    "method": "PUT",
    "expiresAt": 1735000000,
    "fileKey": "uploads/temp/u-7/avatar/abc.png",
    "headers": { "Content-Type": "image/png" },
    "providerData": { "provider": "local", "mode": "signed-url" }
  }
}
```

The local URL is served by `LocalDirectUploadController`. The signature is the
authorisation — no `Authorization: Bearer` header is needed when calling it.
Tampering with `key`, `expire`, `ct`, or `max` invalidates the signature and the
PUT will be rejected with `401 ERR_UNAUTHORIZED`. After expiry, the PUT returns
`410 ERR_PRESIGN_EXPIRED`.

### Browser submission examples

PUT (S3 / R2 / Local):
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
    "url": "https://my-bucket.s3.us-east-1.amazonaws.com/uploads/temp/u-7/avatar/abc.png",
    "fileKey": "uploads/temp/u-7/avatar/abc.png"
  }
}
```

Errors: `404 ERR_FILE_NOT_FOUND` (no object at the key), `400 ERR_BAD_REQUEST` (size mismatch beyond tolerance).

After this, call `POST /upload/commit { fileKey, type }` (passing the
`fileKey` echoed in the response above) to promote the temp object to its
permanent `{type}/` location on the same backend. So a presigned `aadhar`
upload at `uploads/temp/u-7/aadhar/abc.png` ends up at `uploads/aadhar/abc.png`
— exactly the layout server-mediated uploads produce.

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

---

## 7. Local direct upload (HMAC-signed) — `PUT /upload/local/direct`

Mounted only when `UPLOAD_PROVIDER=local`. The server issues this URL via
`POST /upload/presigned-url`; clients then PUT raw bytes against it. **No
`Authorization: Bearer` header is needed** — the URL signature is the authorisation.

| Query param | Required | Description |
|---|---|---|
| `key` | yes | Object key returned by `/upload/presigned-url`. Must start with `uploads/temp/`. |
| `expire` | yes | Unix timestamp (seconds) at which the signature ceases to be valid. |
| `sig` | yes | base64url HMAC-SHA256(secret, `PUT\n{key}\n{expire}\n{ct}\n{max}`). |
| `ct` | optional | Required Content-Type. The PUT's `Content-Type` header MUST match. |
| `max` | optional | Maximum body size in bytes. The PUT body MUST be ≤ this. |

Headers
- `Content-Type` MUST equal `ct` if `ct` is signed in.
- Body is the raw file bytes — NOT multipart/form-data.

### Response 200
> Plus the standard `request` / `timing` / `server` / `timestamp` / `path` envelope.
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": {
    "url": "https://cdn.example.com/uploads/temp/u-7/avatar/abc.png",
    "fileKey": "uploads/temp/u-7/avatar/abc.png",
    "size": 524288,
    "next": { "endpoint": "/upload/presigned-url/complete", "body": { "fileKey": "uploads/temp/u-7/avatar/abc.png" } }
  }
}
```

### Errors
| Status | Code | Reason |
|---|---|---|
| 400 | `ERR_FILE_NOT_UPLOADED` | Body was empty or non-binary. |
| 400 | `ERR_BAD_REQUEST` | Content-Type mismatch with signed `ct`. |
| 401 | `ERR_UNAUTHORIZED` | Missing/invalid signature. |
| 403 | `ERR_FORBIDDEN` | Key was not under `uploads/temp/`. |
| 410 | `ERR_PRESIGN_EXPIRED` | Signed URL has expired (re-mint via `/upload/presigned-url`). |
| 413 | `ERR_FILE_TOO_LARGE` | Body exceeded signed `max`. |

---

## 8. Local signed download — `GET /upload/local/direct`

Mounted only when `UPLOAD_PROVIDER=local`. Streams the file at `key` after
verifying the signature. Used for private types whose static URL would
otherwise be world-readable.

Same `key` / `expire` / `sig` query parameters as the PUT route, except `sig`
is computed for `GET` instead of `PUT` (different canonical string → different
signature; you can't replay a PUT signature for a GET).

Response: file bytes streamed with the appropriate `Content-Type` — this is
the **one route in the entire API that does NOT return the JSON envelope**, by
design (it streams raw file bytes via `res.pipe`). The `X-Request-Id` response
header is still set for correlation. Errors mirror the PUT route and DO use the
JSON error envelope (since they're thrown before the stream starts).

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
POST /upload/presigned-url {type:'avatar', filename, contentType}     → {url, fileKey, headers, expiresAt}
PUT  {url} (browser)                                                  → 200 (bytes go to S3)
POST /upload/presigned-url/complete {fileKey, type:'avatar', size}    → {url, fileKey, exists, size}
POST /upload/commit {fileKey, type:'avatar'}                          → {permanentUrl, serverFileName}
PATCH /users/me {avatarUrl: permanentUrl}                             # write permanent URL
```

The two-step `complete` + `commit` exists for the same reason it does in the
server-mediated flow: write the temp URL to your DB row first, and only commit
to permanent if that succeeded. If you never need the safety net (e.g. a
public CDN avatar with no DB-row coupling), you can skip `commit` and persist
the temp URL — but be aware the temp-cleanup cron will delete it after
`UPLOAD_TEMP_RETENTION_HOURS`.

### Local-direct presigned aadhar upload (UPLOAD_PROVIDER=local)
```
POST /upload/presigned-url {type:'aadhar', filename:'image.png', contentType:'image/png', size:524288}
  → {url:'/upload/local/direct?key=uploads/temp/u-7/aadhar/abc.png&expire=...&ct=image/png&max=524288&sig=...',
     method:'PUT', headers:{Content-Type:'image/png'},
     fileKey:'uploads/temp/u-7/aadhar/abc.png', expiresAt}

PUT  {url}  Content-Type: image/png  body: <raw bytes>
  → file lands at uploads/temp/u-7/aadhar/abc.png
  → 200 {url, fileKey, size, next:{endpoint:'/upload/presigned-url/complete', body:{fileKey}}}

POST /upload/presigned-url/complete {fileKey:'uploads/temp/u-7/aadhar/abc.png', type:'aadhar', size:524288}
  → 200 {exists:true, size, url, fileKey:'uploads/temp/u-7/aadhar/abc.png'}

POST /upload/commit {fileKey:'uploads/temp/u-7/aadhar/abc.png', type:'aadhar'}
  → file moves to uploads/aadhar/abc.png  ← the question Part 1 of this doc set asked
  → 200 {permanentUrl:'/uploads/aadhar/abc.png', serverFileName:'abc.png'}
```

Identical shape to the S3 flow above — the `url` host changes from
`my-bucket.s3.us-east-1.amazonaws.com` to your local API origin, and the
signature scheme switches from AWS Sig V4 to your HMAC-SHA256.
