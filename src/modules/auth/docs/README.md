# Auth Module Developer Guide

## Purpose

The auth module owns account registration, login, refresh-token rotation, logout, and access-token validation. It should remain focused on authentication and session lifecycle only. Profile reads and admin user management belong in `src/modules/user`.

## Request Flow

### Register

`POST /auth/register`

1. `AuthController.register()` receives `RegisterDto`.
2. The global validation pipe validates email, password, and profile fields.
3. `AuthService.register()` lowercases the email and checks uniqueness through `AuthRepository.findByEmail()`.
4. The password is hashed with `bcryptjs` using `APP_CONSTANTS.BCRYPT_ROUNDS`.
5. `AuthRepository.create()` creates the user row.
6. `AuthService.generateTokens()` signs an access token and refresh token.
7. `AuthService.saveRefreshToken()` stores only a bcrypt hash of the refresh token.
8. `AuthRepository.updateLastLogin()` updates `lastLoginAt`.
9. The API returns a public user object and token pair.

### Login

`POST /auth/login`

1. `AuthController.login()` receives `LoginDto`.
2. `AuthService.login()` loads the user by lowercase email.
3. Password comparison uses `bcrypt.compare()`.
4. `SUSPENDED` and `INACTIVE` users are rejected before tokens are issued.
5. A fresh access token and refresh token are generated.
6. The refresh token hash replaces the previous hash in `users.refresh_token`.
7. `lastLoginAt` is updated and the public user plus tokens are returned.

### Refresh

`POST /auth/refresh`

1. `AuthController.refreshTokens()` decodes the refresh token payload only to extract `sub`.
2. `AuthService.refreshTokens()` loads the user by id.
3. The raw refresh token is compared against the stored bcrypt hash.
4. A new access and refresh token pair is issued.
5. The stored refresh token hash is overwritten, completing token rotation.

Important: the controller decode step is not trust. The security check is the bcrypt comparison against the stored hash.

### Logout

`POST /auth/logout`

1. `JwtAuthGuard` validates the access token and populates `req.user`.
2. `AuthController.logout()` extracts the current user.
3. `AuthService.logout()` sets `users.refresh_token` to `NULL`.
4. Existing access tokens remain valid until expiry; the client must discard them.

## Key Files

- `auth.controller.ts`: route definitions and response envelope mapping.
- `auth.service.ts`: credential checks, token signing, refresh-token rotation, logout.
- `auth.repository.ts`: auth-specific user data access.
- `strategies/jwt.strategy.ts`: Passport JWT access-token validation and live user lookup.
- `dto/register.dto.ts`: registration validation contract.
- `dto/login.dto.ts`: login and refresh validation contracts.
- `interfaces/auth.interface.ts`: public response shapes and user sanitization.

## Dependencies

- `JwtService` from `@nestjs/jwt` signs access and refresh tokens.
- `ConfigService` reads `jwt.secret`, `jwt.refreshSecret`, and token expiry settings.
- `PrismaService` is reached through `AuthRepository` and `JwtStrategy`.
- `bcryptjs` hashes passwords and refresh tokens.
- `ApiError`, `Errors`, and `Responses` provide standard error and success envelopes.
- Global guards, interceptors, validation, and exception filtering are wired in `AppModule`.

## Data Model Touchpoints

The module writes to the `User` model:

- `email`, `password`, `firstName`, `lastName`, `phone` during registration.
- `refreshToken` during register, login, refresh, and logout.
- `lastLoginAt` during register and login.
- password-reset and email-verification repository methods exist for future flows but are not exposed by the controller yet.

## Complexity And Risk

- Medium complexity overall.
- Highest-risk area: refresh-token rotation. A change here can break sessions or weaken replay protection.
- The access token contains `{ sub, email, role }`; refresh tokens contain `{ sub }` only.
- Do not store raw refresh tokens. Only bcrypt hashes should persist.
- Keep login errors generic for bad email or password so the API does not leak whether an email exists.
- `JwtStrategy` performs a DB lookup on each protected request. This lets deleted or suspended users be rejected even if their token signature is valid.

## Adding A New Auth Flow

1. Add DTOs in `dto/`.
2. Add service logic in `AuthService`; keep controller code thin.
3. Add repository methods only when the query is auth-specific.
4. Add response and error definitions in `src/common/constants`.
5. Update this guide with the new route flow, dependencies, and security notes.

