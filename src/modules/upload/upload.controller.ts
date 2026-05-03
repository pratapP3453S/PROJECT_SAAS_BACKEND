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
import { Responses } from '../../common/constants/response.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiError } from '../../common/errors/api.error';
import { Errors } from '../../common/constants/error.constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/request.interface';
import { ApiResponse as AppResponse } from '../../common/responses/api.response';
import { createUploadMiddleware } from '../../lib/multer.lib';
import { CommitFileDto, PresignedUploadUrlDto, RemoveFileDto } from './dto/upload.dto';
import { PresignedUrlService } from './services/presigned-url.service';
import { UploadService } from './upload.service';

@ApiTags('Upload')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly presignedUrlService: PresignedUrlService,
  ) {}

  @Post('commit')
  @ApiOperation({ summary: 'Promote temp file to permanent storage' })
  @ApiResponse({ status: 200, description: 'File promoted; permanent URL returned.' })
  @ApiResponse({ status: 404, description: 'Temp file not found.' })
  async commit(@Body() dto: CommitFileDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.uploadService.commitFile(dto.filename, dto.type, {
      userId: user.id,
    });
    return AppResponse.fromDefinition(Responses.FILE_COMMITTED, result);
  }

  @Post('presigned-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate a provider-specific direct upload URL' })
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
      metadata: {
        userId: user.id,
        uploadType: dto.type,
      },
    });

    return AppResponse.fromDefinition(Responses.OK, result);
  }

  @Post(':type')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadMiddleware(path.join(process.cwd(), 'uploads', 'temp'), {
        maxSizeMB: 10,
      }),
    ),
  )
  @ApiOperation({ summary: 'Upload and process a file into temporary storage' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'type',
    description: 'Upload type slug, for example avatar, document, aadhar, identity, passport',
    example: 'avatar',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload',
        },
      },
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
    if (!file) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_UPLOADED);
    }

    const result = await this.uploadService.processFile(file, type, {
      userId: user.id,
    });

    return AppResponse.fromDefinition(Responses.FILE_UPLOADED, result);
  }

  @Delete('remove')
  @ApiOperation({ summary: 'Delete a file by URL' })
  @ApiResponse({ status: 200, description: 'File deleted successfully.' })
  @ApiResponse({ status: 404, description: 'File not found.' })
  async remove(@Body() dto: RemoveFileDto, @CurrentUser() user: AuthenticatedUser) {
    const deleted = await this.uploadService.removeFile(dto.fileUrl, {
      userId: user.id,
    });

    if (!deleted) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
    }

    return AppResponse.fromDefinition(Responses.FILE_DELETED);
  }
}
