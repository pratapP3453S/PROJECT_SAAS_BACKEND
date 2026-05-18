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
import { CurrentUser } from '../../../../../core/decorators/current-user.decorator';
import { Roles } from '../../../../../core/decorators/roles.decorator';
import { PaginationDto } from '../../../../../shared/dto/pagination.dto';
import { JwtAuthGuard } from '../../../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../../core/guards/roles.guard';
import { AuthenticatedUser } from '../../../../../shared/types/request.interface';
import { Responses } from '../../../../../shared/constants/response.constants';
import { ApiResponse as AppResponse } from '../../../../../shared/responses/api.response';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserService } from '../../../application/use-cases/user.service';

/**
 * UserController — HTTP entry point for user profile and admin user management.
 *
 * Responsibility: Accepts validated HTTP requests, delegates all business logic
 * to UserService, and returns a standardized response envelope.
 * Contains no business logic.
 *
 * Route prefix : v1/users  (URI versioning provided by main.ts setGlobalPrefix)
 * Guards       : JwtAuthGuard (all routes) + RolesGuard (admin routes).
 * Dependencies : UserService (application/use-cases)
 *
 * Route map:
 *  GET    /v1/users/me       → getMe()     — current user's own profile (any auth'd user)
 *  PATCH  /v1/users/me       → updateMe()  — update own profile (any auth'd user)
 *  GET    /v1/users          → findAll()   — paginated user list [ADMIN, SUPER_ADMIN only]
 *  GET    /v1/users/:id      → findOne()   — get user by ID [ADMIN, SUPER_ADMIN only]
 *  PATCH  /v1/users/:id      → updateUser()— update any user [ADMIN, SUPER_ADMIN only]
 *  DELETE /v1/users/:id      → remove()    — soft-delete user [SUPER_ADMIN only]
 *
 * Throws (delegated from UserService):
 *  - 404 ERR_USER_NOT_FOUND — if the target user does not exist or is deleted
 */
@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Returns the authenticated user's own profile.
   * Route: GET /users/me  |  Any authenticated user
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
