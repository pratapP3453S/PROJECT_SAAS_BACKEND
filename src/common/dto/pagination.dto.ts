import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * SortOrder — sort direction enum used by PaginationDto and repository methods.
 * Maps directly to Prisma's 'asc' | 'desc' string union.
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * PaginationDto — standard query parameter DTO for paginated list endpoints.
 *
 * Used by: UserController.findAll(), and any future list endpoint.
 * Passed to: UserRepository.findAllPaginated() → BaseRepository.findManyPaginated().
 *
 * Fields:
 *  page      : 1-based page index (default 1, min 1).
 *  limit     : items per page (default 10, max 100).
 *  sortBy    : field name to sort by (validated at the service layer).
 *  sortOrder : 'asc' or 'desc' (default 'desc').
 *  search    : optional full-text search term (applied by repository).
 *
 * Computed getters:
 *  skip : (page - 1) * limit — Prisma offset value.
 *  take : limit              — Prisma page size value.
 *
 * Validation: @Type(() => Number) + @IsInt() coerce query string numbers.
 * AppValidationPipe runs class-validator on this DTO before the handler is called.
 */
export class PaginationDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Field to sort by' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ description: 'Search term' })
  @IsOptional()
  @IsString()
  search?: string;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 10);
  }

  get take(): number {
    return this.limit ?? 10;
  }
}
