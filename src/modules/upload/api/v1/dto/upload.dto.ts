import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * RemoveFileDto — POST body for DELETE /v1/upload/remove.
 * fileUrl is the full URL or relative URL returned by /upload/:type or /commit
 * — the active provider's delete() handles both shapes.
 */
export class RemoveFileDto {
  @ApiProperty({
    description:
      'URL of the file to remove (e.g. /uploads/temp/abc.webp or https://cdn.example.com/...)',
  })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;
}

/**
 * CommitFileDto — POST body for POST /v1/upload/commit.
 *
 * Two valid shapes, depending on which upload flow produced the temp file:
 *
 *  ┌─────────────────────────┬──────────────────────────────────────────┐
 *  │ Server-mediated upload  │ { filename, type }                       │
 *  │ (POST /upload/:type)    │ filename = leaf returned in tempUrl      │
 *  ├─────────────────────────┼──────────────────────────────────────────┤
 *  │ Presigned upload        │ { fileKey, type }                        │
 *  │ (PUT /upload/local/...) │ fileKey  = full key from /presigned-url  │
 *  │ (PUT s3 signed URL)     │            and /presigned-url/complete    │
 *  └─────────────────────────┴──────────────────────────────────────────┘
 *
 * `fileKey` takes precedence when both are provided. The active provider
 * detects which form it received (a key contains '/', a flat filename does not)
 * and resolves the temp object accordingly.
 */
export class CommitFileDto {
  @ApiPropertyOptional({
    description:
      'Leaf server filename returned by POST /upload/:type (server-mediated flow). ' +
      'Required if `fileKey` is omitted.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479.webp',
  })
  @IsString()
  @IsOptional()
  filename?: string;

  @ApiPropertyOptional({
    description:
      'Full temp key returned by POST /upload/presigned-url (presigned flow). ' +
      'Required if `filename` is omitted. Example: ' +
      '"uploads/temp/u-7/aadhar/abc.png".',
    example: 'uploads/temp/u-7/aadhar/f47ac10b.png',
  })
  @IsString()
  @IsOptional()
  fileKey?: string;

  @ApiProperty({
    description:
      'Target category for permanent storage. Built-in: avatar, image, video, ' +
      'audio, document, spreadsheet, presentation, archive, aadhar, identity, passport.',
    example: 'avatar',
  })
  @IsString()
  @IsNotEmpty()
  type: string;
}

/** @deprecated kept for backward compatibility with previous callers. */
export class MoveFileDto {
  @ApiPropertyOptional() @IsString() filename: string;
  @ApiPropertyOptional() @IsString() @IsOptional() type?: string;
}

export class PresignedUploadUrlDto {
  @ApiProperty({
    description: 'Upload type/category. See FileTypeRegistry for built-in types.',
    example: 'avatar',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ description: 'Original client filename', example: 'profile.png' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ description: 'MIME type the client will upload', example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({ description: 'Expected file size in bytes', example: 524288 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  size?: number;

  @ApiPropertyOptional({ description: 'HTTP method requested', example: 'PUT' })
  @IsIn(['PUT', 'POST'])
  @IsOptional()
  method?: 'PUT' | 'POST';
}

/**
 * Body for POST /v1/upload/presigned-url/complete.
 * Sent AFTER the client has uploaded directly to the storage URL returned by
 * /v1/upload/presigned-url. The server verifies the object actually exists.
 */
export class CompletePresignedUploadDto {
  @ApiProperty({ description: 'Object key returned by /upload/presigned-url' })
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @ApiProperty({ description: 'Upload type/category', example: 'avatar' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ description: 'Size the client believes it uploaded' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  size?: number;

  @ApiPropertyOptional({ description: 'Provider-specific receipt (Cloudinary public_id, etc.)' })
  @IsObject()
  @IsOptional()
  providerReceipt?: Record<string, unknown>;
}

export class GenerateDownloadUrlDto {
  @ApiProperty({ description: 'Object key or relative path of the file' })
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @ApiPropertyOptional({ description: 'Custom expiry in seconds (overrides default)' })
  @IsNumber()
  @Min(60)
  @IsOptional()
  expirySeconds?: number;
}
