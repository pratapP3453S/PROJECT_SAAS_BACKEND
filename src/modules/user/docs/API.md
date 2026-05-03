# User API Reference

This document outlines the endpoints available in the **User Module**. For global API standards such as Response Formats and Error Codes, please refer to the [Root API Guide](../../../../docs/API.md).

> **Authentication Required:** All endpoints in this module require a valid access token in the `Authorization: Bearer <token>` header.

---

## 1. Get Current User Profile

Retrieve the currently authenticated user's profile.

**Endpoint:** `GET /users/me`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` |

### Response (200 OK)
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
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

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
