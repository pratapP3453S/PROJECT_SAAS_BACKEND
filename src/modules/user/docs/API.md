# User API Reference

This document outlines the endpoints available in the **User Module**. For global API standards such as Response Formats and Error Codes, please refer to the [Root API Guide](../../../../docs/API.md).

> **Authentication Required:** All endpoints in this module require a valid access token in the `Authorization: Bearer <token>` header.
>
> **Diagnostic envelope.** Every JSON response in this module — success and
> error — ships with `request`, `timing`, and `server` fields alongside
> `data` / `error`. The first endpoint below is shown in full to demonstrate
> the canonical shape; all other examples omit those fields for readability
> (they are always present). See the
> [Root API Guide → Response Format](../../../../docs/API.md#response-format)
> for the field-by-field reference.

---

## 1. Get Current User Profile

Retrieve the currently authenticated user's profile.

**Endpoint:** `GET /users/me`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` |

### Response (200 OK) — full envelope
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile retrieved successfully.",
  "data": {
    "id": "550e8400-e29b-...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "avatar": "/uploads/avatar/abc123.webp",
    "role": "USER",
    "status": "ACTIVE",
    "createdAt": "2026-05-10T22:41:03.182Z"
  },
  "request": {
    "requestId": "9b2c1f74-3b4a-4ed0-91f8-2a1c1c1c4a99",
    "method": "GET",
    "path": "/api/v1/users/me",
    "apiVersion": "v1",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0 ...",
    "userId": "550e8400-e29b-..."
  },
  "timing": {
    "totalMs": 8.4,
    "dbMs": 0,    "dbQueries": 0,
    "cacheMs": 0.6, "cacheOps": 1, "cacheHits": 1, "cacheMisses": 0,
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
  "path": "/api/v1/users/me"
}
```

> All subsequent endpoint examples in this file omit the `request` / `timing` /
> `server` / `timestamp` / `path` fields for readability. They are always
> present with the same shape.

Notice the `timing` block above: this request was served entirely from cache
(`cacheHits: 1`, `dbQueries: 0`), which is why `totalMs` is ~8 ms. A cold call
would show `dbMs > 0` and `cacheMisses: 1`.

---

## 2. Update Current User Profile

Update the currently authenticated user's own profile fields.

**Endpoint:** `PATCH /users/me`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` |

### Request Body
All fields are optional.
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+9876543210",
  "avatar": "/uploads/avatar/newfile.webp"
}
```

### Response (200 OK)
> Plus the standard `request` / `timing` / `server` / `timestamp` / `path` envelope.

Returns the updated user profile representing the fields that were successfully changed.
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile updated successfully.",
  "data": { ... } // Same shape as Get Current User Profile
}
```

---

## 3. List All Users (Admin)

List all non-deleted users with pagination, sorting, and search capabilities.

**Endpoint:** `GET /users`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` (**Requires ADMIN or SUPER_ADMIN role**) |

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `10` | Items per page (max 100) |
| `sortBy` | `string` | `createdAt` | Field to sort by |
| `sortOrder` | `asc|desc` | `desc` | Sort direction |
| `search` | `string` | — | Filter by name or email (partial match) |

### Response (200 OK)
> `meta` carries pagination state. The standard `request` / `timing` / `server` /
> `timestamp` / `path` envelope is also present (omitted here for brevity).
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Users retrieved successfully.",
  "data": [
    { "id": "...", "email": "...", "firstName": "...", "role": "..." }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## 4. Get User by ID (Admin)

Retrieve any specific target user's public profile by UUID.

**Endpoint:** `GET /users/:id`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` (**Requires ADMIN or SUPER_ADMIN role**) |

### Response (200 OK)
Returns the targeted user profile.

**Errors:**
- `404 ERR_USER_NOT_FOUND`

---

## 5. Update User by ID (Admin)

Update any target user's profile by UUID.

**Endpoint:** `PATCH /users/:id`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` (**Requires ADMIN or SUPER_ADMIN role**) |

### Request Body
All fields optional. (Same constraints as user self-update functionality.)
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+9876543210"
}
```

### Response (200 OK)
Returns the updated target user profile.

**Errors:**
- `404 ERR_USER_NOT_FOUND`

---

## 6. Delete User (Super Admin)

Soft-delete a user by UUID. The record is retained in the database (`deletedAt` is set). Soft-deleted users cannot log in and are excluded from all active list queries.

**Endpoint:** `DELETE /users/:id`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` (**Requires SUPER_ADMIN role**) |

### Response (200 OK)
> Plus the standard `request` / `timing` / `server` / `timestamp` / `path` envelope.
```json
{
  "success": true,
  "statusCode": 200,
  "message": "User deleted successfully.",
  "data": null
}
```

**Errors:**
- `404 ERR_USER_NOT_FOUND`
