import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces/request.interface';
import { Responses } from '../../common/constants/response.constants';
import { ApiResponse as AppResponse } from '../../common/responses/api.response';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

/**
 * UserController — HTTP entry point for user profile and admin user management.
 *
 * Responsibility: Accepts validated HTTP requests, delegates all business logic
 * to UserService, and returns a standardized response envelope.
 * Contains no business logic.
 *
 * Route prefix : GET/PATCH/DELETE /users
 * Guards       : JwtAuthGuard (all routes) + RolesGuard (admin routes).
 * Dependencies : UserService (service layer)
 *
 * Route map:
 *  GET    /users/me       → getMe()     — current user's own profile (any auth'd user)
 *  PATCH  /users/me       → updateMe()  — update own profile (any auth'd user)
 *  GET    /users          → findAll()   — paginated user list [ADMIN, SUPER_ADMIN only]
 *  GET    /users/:id      → findOne()   — get user by ID [ADMIN, SUPER_ADMIN only]
 *  PATCH  /users/:id      → updateUser()— update any user [ADMIN, SUPER_ADMIN only]
 *  DELETE /users/:id      → remove()    — soft-delete user [SUPER_ADMIN only]
 *
 * Throws (delegated from UserService):
 *  - 404 ERR_USER_NOT_FOUND — if the target user does not exist or is deleted
 */
@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Returns the authenticated user's own profile.
   * Route: GET /users/me  |  Any authenticated user
   *
   * Flow:
   * 1. @CurrentUser() extracts user.id from the verified JWT via JwtStrategy.
   * 2. Delegates to UserService.findById(id) — cache-aside, strips sensitive fields.
   * 3. Returns HTTP 200 with PublicUserProfile in data.
   *
   * Throws:
   *  - 401 ERR_TOKEN_INVALID  — missing or expired Bearer token (JwtAuthGuard)
   *  - 404 ERR_USER_NOT_FOUND — user was deleted after the token was issued
   */
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.userService.findById(user.id);
    return AppResponse.fromDefinition(Responses.PROFILE_FETCHED, profile);
  }

  /**
   * Updates the authenticated user's own profile fields.
   * Route: PATCH /users/me  |  Any authenticated user
   *
   * Flow:
   * 1. AppValidationPipe validates UpdateUserDto (firstName, lastName, phone, avatar).
   * 2. @CurrentUser() extracts user.id from the verified JWT.
   * 3. Delegates to UserService.update(id, dto) — updates DB, invalidates cache.
   * 4. Returns HTTP 200 with the updated PublicUserProfile.
   *
   * Throws:
   *  - 422 ValidationError   — if DTO constraints fail
   *  - 401 ERR_TOKEN_INVALID — missing or expired Bearer token
   *  - 404 ERR_USER_NOT_FOUND — user was deleted after token was issued
   */
  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    const profile = await this.userService.update(user.id, dto);
    return AppResponse.fromDefinition(Responses.PROFILE_UPDATED, profile);
  }

  /**
   * Returns a paginated list of all users. Admin only.
   * Route: GET /users  |  ADMIN, SUPER_ADMIN
   *
   * Flow:
   * 1. AppValidationPipe validates PaginationDto (page, limit, sortBy, sortOrder, search).
   * 2. RolesGuard enforces ADMIN or SUPER_ADMIN role; 403 otherwise.
   * 3. Delegates to UserService.findAll(query) — queries all non-deleted users
   *    with optional search filter, returns items + PaginationMeta.
   * 4. Returns HTTP 200 with data: PublicUserProfile[] and meta: PaginationMeta.
   *
   * Throws:
   *  - 403 ERR_INSUFFICIENT_PERMISSIONS — caller is not ADMIN or SUPER_ADMIN
   */
  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] List all users with pagination' })
  @ApiResponse({ status: 200, description: 'Users listed successfully' })
  async findAll(@Query() query: PaginationDto) {
    const result = await this.userService.findAll(query);
    return AppResponse.fromDefinition(Responses.USERS_FETCHED, result.items, result.meta);
  }

  /**
   * Returns a single user by their UUID. Admin only.
   * Route: GET /users/:id  |  ADMIN, SUPER_ADMIN
   *
   * Flow:
   * 1. RolesGuard enforces ADMIN or SUPER_ADMIN role.
   * 2. Delegates to UserService.findById(id) — cache-aside lookup.
   * 3. Returns HTTP 200 with PublicUserProfile in data.
   *
   * Throws:
   *  - 403 ERR_INSUFFICIENT_PERMISSIONS — caller lacks required role
   *  - 404 ERR_USER_NOT_FOUND          — no active user with that id
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID (UUID)' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findById(id);
    return AppResponse.fromDefinition(Responses.USER_FETCHED, user);
  }

  /**
   * Updates any user's profile fields by ID. Admin only.
   * Route: PATCH /users/:id  |  ADMIN, SUPER_ADMIN
   *
   * Flow:
   * 1. AppValidationPipe validates UpdateUserDto.
   * 2. RolesGuard enforces ADMIN or SUPER_ADMIN role.
   * 3. Delegates to UserService.update(id, dto) — updates DB, invalidates cache.
   * 4. Returns HTTP 200 with updated PublicUserProfile.
   *
   * Throws:
   *  - 422 ValidationError              — DTO constraints failed
   *  - 403 ERR_INSUFFICIENT_PERMISSIONS — caller lacks required role
   *  - 404 ERR_USER_NOT_FOUND          — no active user with that id
   */
  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Update a user' })
  @ApiParam({ name: 'id', description: 'User ID (UUID)' })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const user = await this.userService.update(id, dto);
    return AppResponse.fromDefinition(Responses.USER_UPDATED, user);
  }

  /**
   * Soft-deletes a user by ID. SuperAdmin only.
   * Route: DELETE /users/:id  |  SUPER_ADMIN
   *
   * Flow:
   * 1. RolesGuard enforces SUPER_ADMIN role exclusively.
   * 2. Delegates to UserService.remove(id) — sets deleted_at = NOW(),
   *    invalidates cache; the record is retained in DB (soft delete).
   * 3. Returns HTTP 200 with data: null.
   *
   * Note: Soft-deleted users cannot log in (JwtStrategy excludes them)
   * and do not appear in any list queries (deletedAt IS NULL filter).
   *
   * Throws:
   *  - 403 ERR_INSUFFICIENT_PERMISSIONS — caller is not SUPER_ADMIN
   *  - 404 ERR_USER_NOT_FOUND          — user does not exist or already deleted
   */
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: '[SuperAdmin] Soft-delete a user' })
  @ApiParam({ name: 'id', description: 'User ID (UUID)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async remove(@Param('id') id: string) {
    await this.userService.remove(id);
    return AppResponse.fromDefinition(Responses.USER_DELETED);
  }
}
