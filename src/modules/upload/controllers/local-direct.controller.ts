import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Put,
  Query,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as mime from 'mime-types';
import { Errors } from '../../../common/constants/error.constants';
import { Public } from '../../../common/decorators/public.decorator';
import { ApiError } from '../../../common/errors/api.error';
import { LocalStorageProvider } from '../providers/local-storage.provider';
import { LocalSignedUrlService } from '../services/local-signed-url.service';

/**
 * LocalDirectUploadController — PUT/GET endpoints for HMAC-signed local URLs.
 *
 * These routes are the local equivalent of S3's `https://bucket.s3...?X-Amz-...`
 * URLs — anyone holding the URL can interact with the named key, but ONLY
 * until the encoded `expire` timestamp and ONLY for the encoded key/method.
 * The signature IS the authorisation; that is why both routes are @Public()
 * (i.e. exempt from JwtAuthGuard).
 *
 * The verifier rejects requests whose:
 *  - signature does not match HMAC-SHA256(secret, canonical) — constant-time
 *  - expire is in the past
 *  - body length exceeds the encoded `max` constraint (PUT only)
 *  - Content-Type does not match the encoded `ct` constraint (PUT only)
 *
 * The PUT route requires raw bytes (NOT multipart). Express raw-body middleware
 * is applied for this route in UploadModule.configure().
 *
 * Mounted only when UPLOAD_PROVIDER=local — see UploadModule.forRoot().
 */
@ApiTags('Upload (Local Direct)')
@Controller('upload/local')
export class LocalDirectUploadController {
  private readonly logger = new Logger(LocalDirectUploadController.name);

  constructor(
    private readonly localProvider: LocalStorageProvider,
    private readonly signer: LocalSignedUrlService,
  ) {}

  // ─── Direct PUT (signed) ──────────────────────────────────────────────────

  @Public()
  @Put('direct')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Land raw bytes at a signed key (local presigned upload)',
    description:
      'Body MUST be raw bytes (Content-Type matching the signed `ct`, e.g. ' +
      'image/jpeg). Do NOT send multipart/form-data — that path is at ' +
      'POST /upload/:type instead.',
  })
  @ApiQuery({ name: 'key', required: true, example: 'uploads/temp/u-7/avatar/abc.jpg' })
  @ApiQuery({ name: 'expire', required: true, example: '1735000000' })
  @ApiQuery({ name: 'sig', required: true, example: 'AbC123...' })
  @ApiQuery({ name: 'ct', required: false, example: 'image/jpeg' })
  @ApiQuery({ name: 'max', required: false, example: '524288' })
  @ApiResponse({ status: 200, description: 'Bytes accepted and staged in temp/.' })
  @ApiResponse({ status: 400, description: 'Empty body, content-type mismatch, or size violation.' })
  @ApiResponse({ status: 401, description: 'Missing/invalid signature.' })
  @ApiResponse({ status: 403, description: 'Signed key targets a path outside uploads/temp/.' })
  @ApiResponse({ status: 410, description: 'Signed URL has expired.' })
  async upload(
    @Query('key') key: string,
    @Query('expire') expireRaw: string,
    @Query('sig') signature: string,
    @Query('ct') contentType: string | undefined,
    @Query('max') maxRaw: string | undefined,
    @Headers('content-type') reqContentType: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const expire = Number(expireRaw);
    const max = maxRaw !== undefined ? Number(maxRaw) : undefined;

    const reason = this.signer.verify({
      method: 'PUT',
      key,
      expire,
      contentType,
      maxSize: max,
      signature,
    });
    if (reason) {
      // Distinguish expired URLs from invalid ones — clients can re-mint
      // expired URLs without retrying with new credentials.
      if (reason === 'expired') {
        throw new ApiError('Signed URL has expired.', 410, {
          code: 'ERR_PRESIGN_EXPIRED',
          name: 'PresignExpiredError',
        });
      }
      throw ApiError.fromDefinition(Errors.UNAUTHORIZED, { details: reason });
    }

    // The bytes live on `req.rawBody` — populated by NestJS because we set
    // `rawBody: true` in NestFactory.create(). That option preserves the raw
    // request body alongside the parsed body, even when body-parser's
    // shouldParse returns false (which it does for our binary content-types).
    // Falls back to draining the stream manually so the handler still works
    // in unit-test rigs that don't enable rawBody.
    const body: Buffer = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.isBuffer(req.body)
        ? req.body
        : await this.drainBody(req, max);

    if (!body || body.length === 0) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_UPLOADED, {
        details:
          'Request body was empty. Send Content-Type: image/jpeg (etc.) ' +
          'with the file bytes as the body — not multipart/form-data.',
      });
    }

    if (max !== undefined && body.length > max) {
      throw ApiError.fromDefinition(Errors.FILE_TOO_LARGE, {
        details: `Body is ${body.length} bytes; signed max is ${max}.`,
      });
    }

    if (contentType && reqContentType) {
      const requested = reqContentType.split(';')[0].trim().toLowerCase();
      if (requested !== contentType.toLowerCase()) {
        throw ApiError.fromDefinition(Errors.BAD_REQUEST, {
          details: `Content-Type "${requested}" does not match signed "${contentType}".`,
        });
      }
    }

    const stored = await this.localProvider.writeDirectUpload(key, body, contentType);
    this.logger.log(`signed PUT ok key=${key} bytes=${body.length}`);
    return {
      url: stored.url,
      fileKey: key,
      size: stored.size,
      // Echo back what the client should now POST to /upload/presigned-url/complete.
      next: { endpoint: '/upload/presigned-url/complete', body: { fileKey: key } },
    };
  }

  // ─── Direct GET (signed download) ────────────────────────────────────────

  @Public()
  @Get('direct')
  @ApiOperation({ summary: 'Stream a file by signed key (local signed download)' })
  @ApiQuery({ name: 'key', required: true })
  @ApiQuery({ name: 'expire', required: true })
  @ApiQuery({ name: 'sig', required: true })
  @ApiResponse({ status: 200, description: 'File streamed.' })
  @ApiResponse({ status: 401, description: 'Missing/invalid signature.' })
  @ApiResponse({ status: 404, description: 'File not found at the signed key.' })
  @ApiResponse({ status: 410, description: 'Signed URL has expired.' })
  async download(
    @Query('key') key: string,
    @Query('expire') expireRaw: string,
    @Query('sig') signature: string,
    @Req() _req: Request,
    @Res() res: Response,
  ) {
    const expire = Number(expireRaw);

    const reason = this.signer.verify({ method: 'GET', key, expire, signature });
    if (reason) {
      if (reason === 'expired') {
        throw new ApiError('Signed URL has expired.', 410, {
          code: 'ERR_PRESIGN_EXPIRED',
          name: 'PresignExpiredError',
        });
      }
      throw ApiError.fromDefinition(Errors.UNAUTHORIZED, { details: reason });
    }

    const resolved = this.localProvider.resolveDownloadPath(key);
    if (!resolved) {
      throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
    }

    const contentType =
      (mime.lookup(resolved.absolutePath) as string | false) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', resolved.size);
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');

    fs.createReadStream(resolved.absolutePath)
      .on('error', (err) => {
        this.logger.error(`stream error key=${key}: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy(err);
        }
      })
      .pipe(res);
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /**
   * Read raw bytes off the request stream into a Buffer.
   *
   * Why this exists: NestJS's `rawBody: true` populates req.rawBody for most
   * binary content-types, but multipart/form-data (and a few edge cases) end
   * up needing a manual drain. Falls through cleanly when body-parser already
   * consumed the stream.
   *
   * Overflow handling — two-stage cap
   *   Stage 1 (soft): stop BUFFERING once we exceed `signedMax + 64 KB`. We
   *     keep reading bytes off the wire (and discarding them) so the request
   *     completes naturally and we can write a clean 413 JSON response back.
   *     Calling `req.destroy()` here would kill the TCP connection mid-upload
   *     and the client would see "no response received" — exactly the
   *     symptom that motivated this change.
   *
   *   Stage 2 (hard): if total exceeds MAX_FILE_SIZE_MB × 2, we destroy. By
   *     then the request is outside any reasonable policy envelope; saving
   *     bandwidth beats giving them a pretty error.
   *
   *   The promise rejects with a 413 ApiError after `end` fires when soft
   *   overflow happened, OR immediately on hard overflow. Either way the
   *   caller's `if (max && body.length > max)` check is redundant but
   *   harmless — defence in depth.
   */
  private drainBody(req: Request, signedMax?: number): Promise<Buffer> {
    if ((req as any)._readableState?.endEmitted || (req as any).complete) {
      return Promise.resolve(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    }

    const HARD_CAP_BYTES =
      Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024 * 2;
    const SOFT_HEADROOM = 64 * 1024;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let softOverflow = false;

      req.on('data', (chunk: Buffer) => {
        total += chunk.length;

        if (total > HARD_CAP_BYTES) {
          req.destroy();
          return reject(
            ApiError.fromDefinition(Errors.FILE_TOO_LARGE, {
              details: 'Request body exceeded the absolute max (MAX_FILE_SIZE_MB × 2).',
            }),
          );
        }

        if (
          !softOverflow &&
          signedMax !== undefined &&
          total > signedMax + SOFT_HEADROOM
        ) {
          softOverflow = true;
          chunks.length = 0; // release the buffers we accumulated
        }

        if (!softOverflow) chunks.push(chunk);
      });

      req.on('end', () => {
        if (softOverflow) {
          return reject(
            ApiError.fromDefinition(Errors.FILE_TOO_LARGE, {
              details: `Body is ${total} bytes; signed max is ${signedMax}.`,
            }),
          );
        }
        resolve(Buffer.concat(chunks));
      });
      req.on('error', reject);
    });
  }
}
