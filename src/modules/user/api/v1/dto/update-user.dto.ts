import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * UpdateUserDto — request body for PATCH /users/me and PATCH /users/:id.
 *
 * All fields are optional — callers send only the fields they want to change.
 * Validated by AppValidationPipe before reaching the controller.
 *
 * Note: email, role, and status are deliberately excluded — these require
 * dedicated flows (email change with verification, role assignment by super-admin).
 *
 * Layer: api/v1/dto — request shape for v1. If v2 of the API needs a different
 * input contract (e.g. supports email-change requests), it gets its own DTO
 * under `api/v2/dto/` without touching this file.
 *
 * Used by: UserController.updateMe(), UserController.updateUser()
 *          → UserService.update() → UserRepository.update()
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatar?: string;
}
