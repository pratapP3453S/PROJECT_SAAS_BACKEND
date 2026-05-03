import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * RemoveFileDto — request body for DELETE /upload/remove.
 *
 * fileUrl is the relative URL (e.g. /uploads/temp/abc.webp or
 * /uploads/avatar/abc.webp) returned by the upload or commit endpoints.
 * UploadService passes this directly to IStorageProvider.delete().
 */
export class RemoveFileDto {
  @ApiProperty({ description: 'Relative URL of the file to remove (e.g. /uploads/temp/abc.webp)' })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;
}

/**
 * CommitFileDto — request body for POST /upload/commit.
 *
 * Carries the server-assigned filename returned by POST /upload/:type and the
 * target type/category that determines the permanent storage directory.
 *
 * Flow: caller receives UploadResult.serverFileName from the upload endpoint,
 * saves a DB record with the tempUrl, then calls POST /upload/commit to promote
 * the file to permanent storage and update the DB record with permanentUrl.
 *
 * Fields:
 *  filename : UUID-based name with .webp extension (e.g. 'abc-123.webp').
 *             Must match the filename returned by the upload endpoint.
 *  type     : Target subdirectory slug (e.g. 'avatar', 'document', 'aadhar').
 *             Determines the permanent storage path or S3 prefix.
 */
export class CommitFileDto {
  @ApiProperty({
    description: 'Server filename returned by the upload endpoint (e.g. abc-123.webp)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479.webp',
  })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({
    description: 'Target type/category for permanent storage (e.g. avatar, document, aadhar)',
    example: 'avatar',
  })
  @IsString()
  @IsNotEmpty()
  type: string;
}

/**
 * MoveFileDto — legacy alias for CommitFileDto.
 * Kept for backwards compatibility with any existing callers.
 * New code should use CommitFileDto.
 *
 * @deprecated Use CommitFileDto instead.
 */
export class MoveFileDto {
  @ApiPropertyOptional({ description: 'Server filename to move' })
  @IsString()
  filename: string;

  @ApiPropertyOptional({ description: 'Target type/directory' })
  @IsString()
  @IsOptional()
  type?: string;
}

export class PresignedUploadUrlDto {
  @ApiProperty({
    description: 'Upload type/category that determines validation and storage rules',
    example: 'avatar',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    description: 'Original client filename',
    example: 'profile.png',
  })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({
    description: 'MIME type the client will upload',
    example: 'image/png',
  })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({
    description: 'Expected file size in bytes',
    example: 524288,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  size?: number;

  @ApiPropertyOptional({
    description: 'HTTP method requested for the signed URL',
    example: 'PUT',
  })
  @IsIn(['PUT', 'POST'])
  @IsOptional()
  method?: 'PUT' | 'POST';
}
