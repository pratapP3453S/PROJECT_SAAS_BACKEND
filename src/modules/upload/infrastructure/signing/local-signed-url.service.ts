import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { UploadConfigService } from '../config/upload-config.service';

/**
 * LocalSignedUrlService — HMAC-based URL signer for the local provider.
 *
 * Why this exists
 *  Cloud providers (S3, R2, Cloudinary, ImageKit) ship signed-URL primitives
 *  baked into their SDKs. The local provider has none — historically it
 *  shipped an "API-proxy" descriptor that just told the client to use
 *  `POST /upload/:type` instead of a real signed URL. That broke the
 *  presigned contract: clients had to special-case local in two places
 *  (the URL shape AND the request body shape).
 *
 *  This service produces TRUE signed URLs that point back at the local API
 *  (`/upload/local/direct`). The signature carries the issuer's grant
 *  intent — anyone holding the URL can PUT/GET against the named key, but
 *  only until the expiry, and only with the same content-type/max-size
 *  constraints encoded into the signature.
 *
 *  The contract is identical to S3's PUT-style presigned URL:
 *    1. Client → POST /v1/upload/presigned-url        (gets {url, headers, fileKey})
 *    2. Client → PUT  {url} with body bytes           (signature is verified here)
 *    3. Client → POST /v1/upload/presigned-url/complete (server re-stat the object)
 *
 * Threat model addressed
 *  - Tampering with `key` / `expire` / `maxSize` invalidates the signature.
 *  - Stolen URL is useless after `expire` (default 1 hour).
 *  - Constant-time comparison prevents timing attacks on the signature.
 *  - The HMAC secret is loaded from UPLOAD_LOCAL_SIGNING_SECRET (or
 *    JWT_SECRET as a fallback for dev).
 *
 * Layer: infrastructure/signing — purely cryptographic adapter for the local
 * filesystem provider. Cloud providers use their SDK's signing facilities and
 * don't depend on this class.
 */
@Injectable()
export class LocalSignedUrlService {
  static readonly QUERY_KEY = 'key';
  static readonly QUERY_EXPIRE = 'expire';
  static readonly QUERY_CONTENT_TYPE = 'ct';
  static readonly QUERY_MAX_SIZE = 'max';
  static readonly QUERY_SIGNATURE = 'sig';

  constructor(private readonly uploadConfig: UploadConfigService) {}

  private get secret(): string {
    const s = this.uploadConfig.getConfig().localSigningSecret;
    if (!s) {
      // Should not happen in practice — UploadConfigService.validateActiveProvider
      // refuses to start when both UPLOAD_LOCAL_SIGNING_SECRET and JWT_SECRET
      // are missing. Defensive guard for tests/runtime tampering.
      throw new Error('LocalSignedUrlService: localSigningSecret is not configured.');
    }
    return s;
  }

  /**
   * Build a signed URL for a single HTTP method against a single object key.
   * Returns the URL path (no host) and the raw signature for inspection/logging.
   */
  signUrl(input: {
    method: 'PUT' | 'GET' | 'DELETE';
    key: string;
    expireSeconds: number;
    contentType?: string;
    maxSizeBytes?: number;
    pathPrefix?: string; // default '/upload/local/direct'
  }): { url: string; signature: string; expireAt: number } {
    const expireAt = Math.floor((Date.now() + input.expireSeconds * 1000) / 1000);
    const signature = this.computeSignature({
      method: input.method,
      key: input.key,
      expire: expireAt,
      contentType: input.contentType,
      maxSize: input.maxSizeBytes,
    });

    const params = new URLSearchParams();
    params.set(LocalSignedUrlService.QUERY_KEY, input.key);
    params.set(LocalSignedUrlService.QUERY_EXPIRE, String(expireAt));
    if (input.contentType) params.set(LocalSignedUrlService.QUERY_CONTENT_TYPE, input.contentType);
    if (input.maxSizeBytes !== undefined) {
      params.set(LocalSignedUrlService.QUERY_MAX_SIZE, String(input.maxSizeBytes));
    }
    params.set(LocalSignedUrlService.QUERY_SIGNATURE, signature);

    const prefix = input.pathPrefix ?? '/upload/local/direct';
    return {
      url: `${prefix}?${params.toString()}`,
      signature,
      expireAt,
    };
  }

  /**
   * Verify a request's query parameters against the HMAC.
   * Returns null on success, or a short reason string on failure.
   */
  verify(input: {
    method: 'PUT' | 'GET' | 'DELETE';
    key: string;
    expire: number;
    contentType?: string;
    maxSize?: number;
    signature: string;
  }): null | string {
    if (!input.key || !input.expire || !input.signature) return 'missing parameters';
    if (!Number.isFinite(input.expire)) return 'invalid expire';
    if (input.expire * 1000 < Date.now()) return 'expired';

    const expected = this.computeSignature({
      method: input.method,
      key: input.key,
      expire: input.expire,
      contentType: input.contentType,
      maxSize: input.maxSize,
    });

    const a = Buffer.from(expected);
    const b = Buffer.from(input.signature);
    if (a.length !== b.length) return 'invalid signature';
    if (!crypto.timingSafeEqual(a, b)) return 'invalid signature';
    return null;
  }

  /**
   * Build the canonical string that gets HMAC-ed. Field order matters for
   * compatibility — never reorder without bumping a version field, or every
   * outstanding signed URL will fail validation.
   */
  private computeSignature(input: {
    method: string;
    key: string;
    expire: number;
    contentType?: string;
    maxSize?: number;
  }): string {
    const canonical = [
      input.method.toUpperCase(),
      input.key,
      String(input.expire),
      input.contentType ?? '',
      input.maxSize !== undefined ? String(input.maxSize) : '',
    ].join('\n');

    return crypto.createHmac('sha256', this.secret).update(canonical).digest('base64url');
  }
}
