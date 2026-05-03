# Auth API Reference

This document outlines the endpoints available in the **Auth Module**. For global API standards such as Idempotency, Response Formats, and Error Codes, please refer to the [Root API Guide](../../../../docs/API.md).

---

## 1. Register User

Register a new user account. Returns access and refresh tokens immediately on success.

**Endpoint:** `POST /auth/register`

### Headers
| Header            | Required  | Description                                                                  |
|-------------------|-----------|------------------------------------------------------------------------------|
| `Idempotency-Key` |  **Yes**  | A unique UUID to prevent double-registration on retries (expires after 24h). |

### Request Body
```json
{
  "email": "user@example.com",
  "password": "Password@123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"     // Optional
}
```

### Response (201 Created)
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Registration successful. Welcome!",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER",
      "status": "PENDING_VERIFICATION"
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...",
      "expiresIn": 604800
    }
  }
}
```

**Common Errors:**
- `409 ERR_EMAIL_ALREADY_EXISTS`
- `422 ERR_VALIDATION_FAILED`

---

## 2. Login

Authenticate with email and password to receive tokens.

**Endpoint:** `POST /auth/login`

### Request Body
```json
{
  "email": "user@example.com",
  "password": "Password@123"
}
```

### Response (200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful.",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER",
      "status": "ACTIVE"
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...",
      "expiresIn": 604800
    }
  }
}
```

**Common Errors:**
- `401 ERR_INVALID_CREDENTIALS`
- `403 ERR_ACCOUNT_SUSPENDED`
- `403 ERR_ACCOUNT_INACTIVE`

---

## 3. Refresh Token

Issue a new access + refresh token pair using a valid refresh token. The old refresh token is invalidated after rotation.

**Endpoint:** `POST /auth/refresh`

### Request Body
```json
{ 
  "refreshToken": "eyJ..." 
}
```

### Response (200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Token refreshed successfully.",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 604800
  }
}
```

**Common Errors:**
- `401 ERR_REFRESH_TOKEN_INVALID`

---

## 4. Logout

Invalidate the current session by nullifying the stored refresh token. All subsequent refresh attempts with the old token will fail. Existing access tokens remain valid until expiry; the client must discard them immediately.

**Endpoint:** `POST /auth/logout`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | **Yes** | `Bearer <access_token>` |

### Response (200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged out successfully.",
  "data": null
}
```

**Common Errors:**
- `401 ERR_UNAUTHORIZED` (if access token is missing or invalid)
