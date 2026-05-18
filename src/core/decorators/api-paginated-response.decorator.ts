import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * @ApiPaginatedResponse(Model) — Swagger decorator for paginated list endpoints.
 *
 * Generates an OpenAPI response schema that combines the standard success
 * envelope with a typed array in `data` and a `meta` pagination object.
 *
 * Usage:
 *  @ApiPaginatedResponse(UserDto)
 *  @Get()
 *  async findAll() { ... }
 *
 * Generated schema includes:
 *  success, statusCode, message, data (array of Model), meta (PaginationMeta),
 *  timestamp — matching the shape produced by ApiResponse.buildPaginated().
 *
 * Mechanism:
 * 1. ApiExtraModels(model) — registers the model class with Swagger so
 *    $ref can resolve it even if it's not used in another @ApiResponse.
 * 2. ApiOkResponse({ schema }) — inline schema using allOf + $ref to the model.
 *
 * See also: PaginationMeta → src/shared/responses/api.response.ts
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(model: TModel) => {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        allOf: [
          {
            properties: {
              success: { type: 'boolean', example: true },
              statusCode: { type: 'number', example: 200 },
              message: { type: 'string', example: 'Data retrieved successfully' },
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'number', example: 1 },
                  limit: { type: 'number', example: 10 },
                  total: { type: 'number', example: 100 },
                  totalPages: { type: 'number', example: 10 },
                  hasNextPage: { type: 'boolean', example: true },
                  hasPreviousPage: { type: 'boolean', example: false },
                },
              },
              timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
            },
          },
        ],
      },
    }),
  );
};
