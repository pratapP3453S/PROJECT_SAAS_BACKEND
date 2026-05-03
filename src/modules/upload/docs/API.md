# Upload API Reference

This document outlines the endpoints available in the **Upload Module**. For global API standards such as Response Formats and Error Codes, please refer to the [Root API Guide](../../../../docs/API.md).

> **Authentication Required:** All endpoints in this module require a valid access token in the `Authorization: Bearer <token>` header.

The upload pipeline is a **two-stage process** to keep orphaned files from accumulating.
```text
Stage 1: POST /upload/:type  →  file saved to temp storage  →  tempUrl returned
  (caller saves tempUrl to their DB record at this point)

Stage 2: POST /upload/commit  →  file moved to permanent storage  →  permanentUrl returned
  (caller updates their DB record: tempUrl → permanentUrl)
```

---

## 1. Upload File (Stage 1)

Upload, convert, process, and optionally encrypt a file for temporary staging.

**Endpoint:** `POST /upload/:type`

**Path Parameters:**
- `:type`: Represents the upload context. Must be one of: `avatar`, `document`, `aadhar`, `identity`, `passport`.

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` |
| `Content-Type` | **Yes** | Must be `multipart/form-data` |
| `Idempotency-Key`| **Recommended**| Prevent multi-submissions of same file. |

### Constraints
- **Field name:** `file`
- **Max size:** 10 MB
- **Allowed types:** images (`image/jpeg`, `image/png`, `image/webp`) and documents (`application/pdf`)
- **Conversion:** All images are converted to WebP format at ≤1024px width, 80 quality.
- **Encryption:** Sensitive types (`aadhar`, `identity`, `document`, `passport`) are AES-256-CBC encrypted on disk.

### Response (201 Created)
```json
{
  "success": true,
  "statusCode": 201,
  "message": "File uploaded successfully. Use POST /upload/commit to promote to permanent storage.",
  "data": {
    "tempUrl": "/uploads/temp/abc123.webp",
    "serverFileName": "abc123.webp",
    "originalFileName": "photo.jpg",
    "mimeType": "image/webp",
    "size": 45678,
    "isEncrypted": false
  }
}
```

**Common Errors:**
- `400 ERR_FILE_NOT_UPLOADED`: No file sent.
- `413 ERR_FILE_TOO_LARGE`: Max 10MB exceeded.
- `415 ERR_INVALID_FILE_TYPE`: Unrecognized format.

---

## 2. Commit File (Stage 2)

Promote a temporary file to permanent storage. Call this endpoint after verifying the persistence of the `tempUrl` in your relevant business database layer.

**Endpoint:** `POST /upload/commit`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` |

### Request Body
```json
{
  "filename": "abc123.webp",
  "type": "avatar"
}
```

### Response (200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "File committed to permanent storage.",
  "data": {
    "permanentUrl": "/uploads/avatar/abc123.webp",
    "serverFileName": "abc123.webp"
  }
}
```

**Common Errors:**
- `404 ERR_FILE_NOT_FOUND`

---

## 3. Remove File

Remove an uploaded file from storage by its remote URL. Note: this operation is idempotent — it returns `404` and performs no action if the file does not already exist.

**Endpoint:** `DELETE /upload/remove`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` |

### Request Body
```json
{ 
  "fileUrl": "/uploads/temp/abc123.webp" 
}
```

### Response (200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "File deleted successfully.",
  "data": null
}
```

**Common Errors:**
- `404 ERR_FILE_NOT_FOUND`
