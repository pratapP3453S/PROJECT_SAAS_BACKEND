import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptBuffer,
  decryptString,
  encryptBuffer,
  encryptString,
  generateSecureToken,
} from '../utils/encryption.util';

/**
 * EncryptionService — injectable wrapper around AES-256-CBC encryption utilities.
 *
 * Responsibility: Loads the IMAGE_ENCRYPTION_KEY from config once at construction
 * and delegates all crypto operations to pure functions in encryption.util.ts.
 * Provided globally via SharedModule (@Global) so any module can inject it.
 *
 * The key is read from ConfigService rather than process.env directly so it
 * participates in the validated config lifecycle (env.config.ts validates it exists).
 *
 * Methods:
 *  encryptBuffer(buffer)         : AES-256-CBC encrypt a binary buffer (file data).
 *  decryptBuffer(encryptedBuffer): Reverse of encryptBuffer.
 *  encryptString(text)           : Encrypt a UTF-8 string → base64 ciphertext.
 *  decryptString(encryptedBase64): Reverse of encryptString.
 *  generateToken(bytes?)         : Cryptographically random hex token (default 32 bytes).
 *
 * Used by: UploadService (encrypts sensitive file types before writing to disk).
 * See also: encryption.util.ts → src/shared/utils/encryption.util.ts
 */
@Injectable()
export class EncryptionService {
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.get<string>('IMAGE_ENCRYPTION_KEY', 'default-secret-key');
  }

  encryptBuffer(buffer: Buffer): Buffer {
    return encryptBuffer(buffer, this.secret);
  }

  decryptBuffer(encryptedBuffer: Buffer): Buffer {
    return decryptBuffer(encryptedBuffer, this.secret);
  }

  encryptString(text: string): string {
    return encryptString(text, this.secret);
  }

  decryptString(encryptedBase64: string): string {
    return decryptString(encryptedBase64, this.secret);
  }

  generateToken(bytes = 32): string {
    return generateSecureToken(bytes);
  }
}
