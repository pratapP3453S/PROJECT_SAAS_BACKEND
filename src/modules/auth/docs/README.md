# Auth Module Developer Guide

## Purpose

The auth module owns account registration, login, refresh-token rotation,
logout, and access-token validation. It should remain focused on
authentication and session lifecycle only. Profile reads and admin user
management belong in [src/modules/user](../../user/).

## Layer map

```
modules/auth/
├── domain/
│   └── entities/auth.entity.ts          # AuthTokens, AuthResponse, PublicUser, toPublicUser()
├── infrastructure/
│   ├── prisma/auth.repository.ts        # extends BaseRepository<User>
│   └── jwt/jwt.strategy.ts              # PassportStrategy for Bearer-token verification
├── application/
│   └── use-cases/auth.service.ts        # register / login / refresh / logout
├── api/
│   └── v1/
│       ├── controllers/auth.controller.ts
│       ├── dto/login.dto.ts             # LoginDto, RefreshTokenDto, future flows
│       ├── dto/register.dto.ts
│       └── auth-v1.module.ts            # wires JwtModule + PassportModule + providers
└── auth.module.ts                       # aggregator (re-exports AuthV1Module)
```

## Routes (v1)

All routes are URI-versioned through `@Controller({ path: 'auth', version: '1' })`,
producing `/api/v1/auth/...`.

### Register

`POST /api/v1/auth/register`

1. `AuthController.register()` receives `RegisterDto`.
2. The global `AppValidationPipe` validates email, password, and profile fields.
3. `AuthService.register()` lowercases the email and checks uniqueness through `AuthRepository.findByEmail()`.
4. The password is hashed with `bcryptjs` using `APP_CONSTANTS.BCRYPT_ROUNDS`.
5. `AuthRepository.create()` creates the user row.
6. `AuthService.generateTokens()` signs an access token and refresh token.
7. `AuthService.saveRefreshToken()` stores only a bcrypt hash of the refresh token.
8. `AuthRepository.updateLastLogin()` updates `lastLoginAt`.
9. The API returns a public user object and token pair.

### Login

`POST /api/v1/auth/login`

1. `AuthController.login()` receives `LoginDto`.
2. `AuthService.login()` loads the user by lowercase email.
3. Password comparison uses `bcrypt.compare()`.
4. `SUSPENDED` and `INACTIVE` users are rejected before tokens are issued.
5. A fresh access token and refresh token are generated.
6. The refresh token hash replaces the previous hash in `users.refresh_token`.
7. `lastLoginAt` is updated and the public user plus tokens are returned.

### Refresh

`POST /api/v1/auth/refresh`

1. `AuthController.refreshTokens()` decodes the refresh token payload only to extract `sub`.
2. `AuthService.refreshTokens()` loads the user by id.
3. The raw refresh token is compared against the stored bcrypt hash.
4. A new access and refresh token pair is issued.
5. The stored refresh token hash is overwritten, completing token rotation.

The controller decode step is not trust. The security check is the bcrypt comparison against the stored hash.

### Logout

`POST /api/v1/auth/logout`

1. `JwtAuthGuard` validates the access token and populates `req.user`.
2. `AuthController.logout()` extracts the current user.
3. `AuthService.logout()` sets `users.refresh_token` to `NULL`.
4. Existing access tokens remain valid until expiry; the client must discard them.

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
- Password-reset and email-verification repository methods exist for future flows but are not exposed by the controller yet.

## Complexity And Risk

- Medium complexity overall.
- Highest-risk area: refresh-token rotation. A change here can break sessions or weaken replay protection.
- The access token contains `{ sub, email, role }`; refresh tokens contain `{ sub }` only.
- Do not store raw refresh tokens. Only bcrypt hashes should persist.
- Keep login errors generic for bad email or password so the API does not leak whether an email exists.
- `JwtStrategy` performs a DB lookup on each protected request. This lets deleted or suspended users be rejected even if their token signature is valid.

## Adding A New Auth Flow

1. Add request DTOs in `api/v1/dto/`.
2. Add service logic in `application/use-cases/auth.service.ts`; keep the controller thin.
3. Add repository methods to `infrastructure/prisma/auth.repository.ts` only when the query is auth-specific.
4. Add response and error definitions in [shared/constants](../../../shared/constants/).
5. Update this guide and `docs/API.md` with the new route flow, dependencies, and security notes.

## Adding A v2

1. Copy `api/v1/` to `api/v2/`.
2. Change every `@Controller({ ..., version: '1' })` to `version: '2'`.
3. Adjust DTOs/serializers as needed for the breaking changes.
4. Write `api/v2/auth-v2.module.ts` mirroring `auth-v1.module.ts`.
5. Import both submodules from `auth.module.ts`. v1 continues to serve existing clients.
