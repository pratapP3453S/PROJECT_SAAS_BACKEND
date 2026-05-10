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

Every JSON response — success **and** error — ships with a diagnostic envelope
of `request`, `timing`, `server`, and (when paginated) `meta`. Think of these
as the API equivalent of the Axios response object: most callers only read
`data` / `error`, but the other fields are always there for debugging,
correlation, and observability.

The same `requestId` is also returned as the `X-Request-Id` response header,
so log aggregators can correlate without parsing the JSON body.

### Success Response

```json
{
  "success": true,
  "statusCode": 201,
  "message": "File uploaded successfully. Use POST /upload/commit ...",
  "data": { "tempUrl": "/uploads/temp/abc.webp", "size": 45678, "isEncrypted": false },
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

### Paginated Response

`meta` carries pagination state (page, limit, total, …). The diagnostic
fields (`request`, `timing`, `server`) are present on paginated responses too —
omitted from the example below for brevity.

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
  "request": { "requestId": "...", "method": "GET", "path": "/api/v1/users", "apiVersion": "v1" },
  "timing":  { "totalMs": 42.1, "dbMs": 18.3, "dbQueries": 1, "cacheMs": 0.4, "cacheOps": 1, "cacheHits": 1, "cacheMisses": 0, "externalMs": 0, "externalCalls": 0 },
  "server":  { "hostname": "app-pod-7c4f", "pid": 1234, "env": "production", "nodeVersion": "v22.18.0" },
  "timestamp": "2026-05-10T22:41:03.182Z",
  "path": "/api/v1/users"
}
```

### Error Response

Same diagnostic envelope as success — clients can read `request.requestId`,
`timing.totalMs`, etc. uniformly regardless of `success`. `error.stack` is
included only when `NODE_ENV !== 'production'`.

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
  "request": {
    "requestId": "9b2c1f74-3b4a-4ed0-91f8-2a1c1c1c4a99",
    "method": "POST",
    "path": "/api/v1/auth/register",
    "apiVersion": "v1",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0 ..."
  },
  "timing": {
    "totalMs": 14.3,
    "dbMs": 0,    "dbQueries": 0,
    "cacheMs": 0, "cacheOps": 0, "cacheHits": 0, "cacheMisses": 0,
    "externalMs": 0, "externalCalls": 0
  },
  "server": {
    "hostname": "app-pod-7c4f",
    "pid": 1234,
    "env": "production",
    "nodeVersion": "v22.18.0",
    "appVersion": "1.0.0"
  },
  "timestamp": "2026-05-10T22:41:03.215Z",
  "path": "/api/v1/auth/register"
}
```

### Diagnostic Envelope Field Reference

#### `request` — request identity (always present)
| Field | Type | Notes |
|---|---|---|
| `requestId` | string (uuid) | Stable id; mirrored as `X-Request-Id` header. Inbound `X-Request-Id` is honoured (gateway tracing). |
| `method` | string | HTTP method. |
| `path` | string | Original URL with query string. |
| `apiVersion` | string? | Extracted from `/api/vN/…`. Omitted for non-versioned routes. |
| `ip` | string? | Caller IP (Express's resolved `req.ip`). |
| `userAgent` | string? | Caller `User-Agent`. |
| `userId` | string? | Authenticated user id, when set by `JwtAuthGuard`. |

#### `timing` — end-to-end latency breakdown (always present, counts default to 0)
| Field | Type | Notes |
|---|---|---|
| `totalMs` | number | Wall-clock ms from middleware entry to response render. |
| `dbMs` | number | Sum of every Prisma query duration during the request. |
| `dbQueries` | number | Count of Prisma queries fired. |
| `cacheMs` | number | Sum of every CacheService op duration. |
| `cacheOps` | number | Count of cache ops (get + set + del). |
| `cacheHits` | number | Cache reads that returned a value. |
| `cacheMisses` | number | Cache reads that returned null (or errored). |
| `externalMs` | number | Aggregate external HTTP-call time (populated when an axios interceptor is wired). |
| `externalCalls` | number | Count of external HTTP calls. |

#### `server` — process identity (always present)
| Field | Type | Notes |
|---|---|---|
| `hostname` | string | OS hostname (pod name in k8s). |
| `pid` | number | Process id. |
| `env` | string | `NODE_ENV`. |
| `nodeVersion` | string | `process.version`. |
| `region` | string? | `AWS_REGION` or `REGION` env. |
| `appVersion` | string? | `APP_VERSION` env. |

#### `tags` — free-form bag (optional)
Anything pushed via `RequestContext.tag(key, value)` from any service during
the request. Useful for ad-hoc diagnostics without changing the envelope shape.

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
