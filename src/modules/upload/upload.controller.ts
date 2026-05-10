import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import * as path from 'path';
import { Errors } from '../../common/constants/error.constants';
import { Responses } from '../../common/constants/response.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiError } from '../../common/errors/api.error';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/request.interface';
import { ApiResponse as AppResponse } from '../../common/responses/api.response';
import { createUploadMiddleware } from '../../lib/multer.lib';
import {
  CommitFileDto,
  CompletePresignedUploadDto,
  GenerateDownloadUrlDto,
  PresignedUploadUrlDto,
  RemoveFileDto,
} from './dto/upload.dto';
import { PresignedUrlService } from './services/presigned-url.service';
import { UploadService } from './upload.service';

/**
 * Resolve Multer's max-file-size at module load time.
 *
 * Why: @UseInterceptors(FileInterceptor) runs before NestJS DI is fully ready
 * for request-scoped values, so the multer options object MUST be a module-time
 * constant. Reading process.env.MAX_FILE_SIZE_MB here keeps the controller in
 * sync with UploadConfigService (which derives its limit from the same env var).
 */
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 10);

/**
 * IMPORTANT — route ordering inside this controller is load-bearing.
 *
 * The catch-all `@Post(':type')` matches ANY single-segment POST under
 * /upload (commit, presigned-url, download-url, etc.). Express resolves
 * routes top-down in declaration order, so `:type` MUST be declared LAST —
 * after every literal route — or it would swallow them and trigger the
 * Multer FileInterceptor for non-multipart requests, producing a confusing
 * 415 ERR_HTTP_415 ("octet-stream not allowed") instead of the intended JSON
 * handler.
 *
 * If you add a new POST route, add it ABOVE the `:type` route, not below.
 */
@ApiTags('Upload')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly presignedUrlService: PresignedUrlService,
  ) {}

  // ─── Specific paths first ────────────────────────────────────────────────

  @Post('commit')
  @ApiOperation({
    summary: 'Promote temp file to permanent storage',
    description:
      'Accepts either { filename, type } (server-mediated upload) OR ' +
      '{ fileKey, type } (presigned upload). fileKey takes precedence — the ' +
      'value returned by POST /upload/presigned-url and echoed by /complete.',
  })
  @ApiResponse({ status: 200, description: 'File promoted; permanent URL returned.' })
  @ApiResponse({ status: 400, description: 'Neither filename nor fileKey was provided.' })
  @ApiResponse({ status: 404, description: 'Temp file not found.' })
  async commit(@Body() dto: CommitFileDto, @CurrentUser() user: AuthenticatedUser) {
    const tempIdentifier = dto.fileKey ?? dto.filename;
    if (!tempIdentifier) {
      throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
        details:
          'Either `filename` (server-mediated upload) or `fileKey` (presigned upload) is required.',
      });
    }
    const result = await this.uploadService.commitFile(tempIdentifier, dto.type, {
      userId: user.id,
    });
    return AppResponse.fromDefinition(Responses.FILE_COMMITTED, result);
  }

  @Delete('remove')
  @ApiOperation({ summary: 'Delete a file by URL' })
  @ApiResponse({ status: 200, description: 'File deleted.' })
  @ApiResponse({ status: 404, description: 'File not found.' })
  async remove(@Body() dto: RemoveFileDto, @CurrentUser() user: AuthenticatedUser) {
    const deleted = await this.uploadService.removeFile(dto.fileUrl, { userId: user.id });
    if (!deleted) throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
    return AppResponse.fromDefinition(Responses.FILE_DELETED);
  }

  // ─── Direct browser → storage flow (presigned URLs) ──────────────────────

  @Post('presigned-url/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify a direct upload finished and is reachable in storage',
    description:
      'Call after the client has PUT/POSTed bytes to the URL returned by /presigned-url. ' +
      'The server stats the object on the storage backend; without this step a malicious ' +
      'client could record file URLs that were never actually uploaded.',
  })
  @ApiResponse({ status: 200, description: 'Upload verified.' })
  @ApiResponse({ status: 404, description: 'No object found in storage at the given key.' })
  async completePresignedUpload(
    @Body() dto: CompletePresignedUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.presignedUrlService.completePresignedUpload({
      fileKey: dto.fileKey,
      uploadType: dto.type,
      expectedSize: dto.size,
      providerReceipt: { ...dto.providerReceipt, userId: user.id },
    });
    return AppResponse.fromDefinition(Responses.OK, result);
  }

  @Post('presigned-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a provider-specific direct upload URL' })
  @ApiResponse({ status: 200, description: 'Presigned upload URL generated.' })
  async createPresignedUploadUrl(
    @Body() dto: PresignedUploadUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const fileKey = this.presignedUrlService.buildUploadKey(dto.type, dto.filename, user.id);
    const result = await this.presignedUrlService.generateUploadUrl(fileKey, dto.type, {
      method: dto.method ?? 'PUT',
      contentType: dto.contentType,
      maxSizeBytes: dto.size,
      metadata: { userId: user.id, uploadType: dto.type },
    });
    return AppResponse.fromDefinition(Responses.OK, result);
  }

  @Post('download-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a provider-specific signed download URL' })
  @ApiResponse({ status: 200, description: 'Presigned download URL generated.' })
  async createDownloadUrl(@Body() dto: GenerateDownloadUrlDto) {
    const result = await this.presignedUrlService.generateDownloadUrl(dto.fileKey, {
      method: 'GET',
      expirySeconds: dto.expirySeconds,
    });
    return AppResponse.fromDefinition(Responses.OK, result);
  }

  // ─── Server-mediated upload (catch-all `:type` — MUST be declared last) ──

  @Post(':type')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadMiddleware(path.join(process.cwd(), 'uploads', 'temp'), {
        maxSizeMB: MAX_FILE_SIZE_MB,
      }),
    ),
  )
  @ApiOperation({ summary: 'Upload and process a file into temporary storage' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'type',
    example: 'avatar',
    description:
      'Upload category. Reserved tokens (commit, remove, presigned-url, ' +
      'download-url) are claimed by the literal routes above and never reach ' +
      'this handler.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'File processed and staged.' })
  @ApiResponse({ status: 400, description: 'No file provided.' })
  @ApiResponse({ status: 415, description: 'Unsupported file type.' })
  async upload(
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw ApiError.fromDefinition(Errors.FILE_NOT_UPLOADED);

    // Defence in depth: refuse if the URL segment matches a name that should
    // have been routed by one of the literal handlers above. Reaching here
    // means the route table is misordered (or a future literal route was
    // added below `:type` by mistake).
    if (RESERVED_TYPE_SEGMENTS.has(type)) {
      throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
        details: `"${type}" is a reserved upload route, not an upload type.`,
      });
    }

    const result = await this.uploadService.processFile(file, type, { userId: user.id });
    return AppResponse.fromDefinition(Responses.FILE_UPLOADED, result);
  }
}

/**
 * The set of literal POST routes mounted on the upload controller. Used by the
 * `:type` handler as a sanity guard — if this list ever drifts from the actual
 * route declarations, the `if (RESERVED_TYPE_SEGMENTS.has(type))` check turns
 * the bug into a clear 400 instead of a confusing 415 from Multer.
 */
const RESERVED_TYPE_SEGMENTS = new Set([
  'commit',
  'remove',
  'presigned-url',
  'download-url',
]);
