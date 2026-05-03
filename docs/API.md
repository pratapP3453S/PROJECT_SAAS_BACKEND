# API Documentation

## Base URL

```
http://localhost:5000/api/v1
```

> Port is controlled by the `PORT` env variable (default `5001`).

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Tokens are obtained from `POST /auth/login` or `POST /auth/register`.

---

## Idempotency

All `POST` endpoints are protected against duplicate processing at two levels.

### Client-keyed (recommended for mutations)

Send a unique `Idempotency-Key` header with every POST that must not be processed twice (payments, registrations, file uploads, etc.):

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Behaviour:
- **First request** — processed normally; key + SHA-256 request fingerprint stored for 24 hours.
- **Retry with same key + same body** — original response replayed instantly (no reprocessing).
- **Same key + different body** — `422 ERR_IDEMPOTENCY_KEY_MISMATCH` (indicates a client bug).
- **After 24 h** — key expires; a new request with the same key starts fresh.

### Hash-only (automatic double-submit guard)

Even without a header, the server computes a SHA-256 fingerprint of `method:path:body`. If an identical request arrives within **30 seconds**, it is rejected with `409 ERR_DUPLICATE_REQUEST`.

### Error codes

| Code | HTTP | When |
|------|------|------|
| `ERR_DUPLICATE_REQUEST` | 409 | Identical request within 30-second window (no key) |
| `ERR_IDEMPOTENCY_KEY_MISMATCH` | 422 | Same key reused with a different payload |

### Request hash algorithm

```
SHA-256( METHOD + ":" + PATH + ":" + stableJSON(body) )
```

`stableJSON` sorts object keys recursively so `{b,a}` and `{a,b}` produce the same hash.

---

## Response Format

### Success Response

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/v1/..."
}
```

### Paginated Response

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Users retrieved successfully.",
  "data": [ { "id": "...", "email": "..." }, ... ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response

```json
{
  "success": false,
  "statusCode": 422,
  "error": {
    "name": "ValidationError",
    "code": "ERR_VALIDATION_FAILED",
    "message": "The request contains invalid data.",
    "details": "2 field(s) failed validation.",
    "fields": [
      {
        "field": "email",
        "message": "Please provide a valid email address.",
        "value": "not-an-email",
        "constraint": "IsEmail"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters long.",
        "value": "123",
        "constraint": "MinLength"
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/v1/auth/register"
}
```

---

## Success Message Reference

All success messages are defined in `src/common/constants/response.constants.ts` (`Responses`). Controllers call `AppResponse.fromDefinition(Responses.KEY, data)` — no inline message strings.

| Key | HTTP | Message |
|-----|------|---------|
| `REGISTER_SUCCESS` | 201 | Registration successful. Welcome! |
| `LOGIN_SUCCESS` | 200 | Login successful. |
| `TOKEN_REFRESHED` | 200 | Token refreshed successfully. |
| `LOGOUT_SUCCESS` | 200 | Logged out successfully. |
| `PROFILE_FETCHED` | 200 | Profile retrieved successfully. |
| `PROFILE_UPDATED` | 200 | Profile updated successfully. |
| `USERS_FETCHED` | 200 | Users retrieved successfully. |
| `USER_FETCHED` | 200 | User retrieved successfully. |
| `USER_UPDATED` | 200 | User updated successfully. |
| `USER_DELETED` | 200 | User deleted successfully. |
| `FILE_UPLOADED` | 201 | File uploaded successfully. Use POST /upload/commit to promote to permanent storage. |
| `FILE_COMMITTED` | 200 | File committed to permanent storage. |
| `FILE_DELETED` | 200 | File deleted successfully. |
| `HEALTH_OK` | 200 | pong |
| `OK` | 200 | Request completed successfully. |
| `CREATED` | 201 | Resource created successfully. |
| `DELETED` | 200 | Resource deleted successfully. |

---

## Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| `ERR_VALIDATION_FAILED` | 422 | Request validation failed |
| `ERR_UNAUTHORIZED` | 401 | Authentication required |
| `ERR_TOKEN_EXPIRED` | 401 | JWT token has expired |
| `ERR_TOKEN_INVALID` | 401 | JWT token is invalid |
| `ERR_REFRESH_TOKEN_INVALID` | 401 | Refresh token invalid/expired |
| `ERR_FORBIDDEN` | 403 | Insufficient permissions |
| `ERR_NOT_FOUND` | 404 | Resource not found |
| `ERR_USER_NOT_FOUND` | 404 | User not found |
| `ERR_INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `ERR_EMAIL_ALREADY_EXISTS` | 409 | Email already registered |
| `ERR_ACCOUNT_SUSPENDED` | 403 | Account suspended |
| `ERR_ACCOUNT_INACTIVE` | 403 | Account inactive |
| `ERR_EMAIL_NOT_VERIFIED` | 403 | Email not yet verified |
| `ERR_INVALID_PASSWORD` | 400 | Current password incorrect (on password change) |
| `ERR_FILE_NOT_UPLOADED` | 400 | No file in request |
| `ERR_FILE_TOO_LARGE` | 413 | File exceeds 10 MB limit |
| `ERR_INVALID_FILE_TYPE` | 415 | File type not allowed |
| `ERR_FILE_NOT_FOUND` | 404 | File not found or already deleted |
| `ERR_DUPLICATE_REQUEST` | 409 | Duplicate POST within 30-second window |
| `ERR_IDEMPOTENCY_KEY_MISMATCH` | 422 | Idempotency-Key reused with different payload |
| `ERR_INTERNAL_SERVER` | 500 | Unexpected server error |

---

## Endpoint Modules

For cleanliness, our codebase separates API endpoint documentation feature-wise into their respective module directories. Click any module below to view its specific API definition including request shapes, token requirements, idempotency rules, and response objects.

### [Auth Endpoints](../src/modules/auth/docs/API.md)
Contains `register`, `login`, `refresh`, and `logout`.

### [User Endpoints](../src/modules/user/docs/API.md)
Contains `users/me` and the Admin/Super Admin user listing, editing, and soft-delete endpoints.

### [Upload Endpoints](../src/modules/upload/docs/API.md)
Contains the two-stage file upload, committing, and removal endpoints.

### [Health Endpoints](../src/modules/health/docs/API.md)
Contains the public liveness `/health/ping` and readiness limits proxy check endpoints.
