import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * encryption.util — pure AES-256-CBC encryption/decryption functions.
 *
 * Responsibility: Provides stateless crypto operations used by EncryptionService.
 * Pure functions (no class, no DI) so they can be used in scripts and tests
 * without the NestJS container.
 *
 * Algorithm : AES-256-CBC
 * Key derivation: SHA-256 hash of the secret string → 32-byte key.
 *   This allows arbitrary-length secret strings; for production, pass a
 *   properly generated 32-byte key stored in IMAGE_ENCRYPTION_KEY.
 * IV : 16 random bytes prepended to the ciphertext so each encryption
 *   produces a unique output even for identical inputs.
 *
 * Functions:
 *  encryptBuffer(buffer, secret)       : Encrypt binary data → iv + ciphertext Buffer.
 *  decryptBuffer(encryptedBuffer, secret): Strip IV, decrypt → original Buffer.
 *  encryptString(text, secret)         : UTF-8 text → base64 ciphertext string.
 *  decryptString(encryptedBase64, secret): base64 → decrypted UTF-8 string.
 *  saveEncryptedFile(filePath, buffer, secret): encrypt + write to disk in one step.
 *  readDecryptedFile(filePath, secret) : read from disk + decrypt in one step.
 *  hashString(value)                   : SHA-256 hex digest (non-reversible).
 *  generateSecureToken(bytes?)         : cryptographically random hex string.
 *
 * Used by: EncryptionService → src/shared/services/encryption.service.ts
 */

const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

function getKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptBuffer(buffer: Buffer, secret: string): Buffer {
  const key = getKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

export function decryptBuffer(encryptedBuffer: Buffer, secret: string): Buffer {
  const key = getKey(secret);
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const data = encryptedBuffer.subarray(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function encryptString(text: string, secret: string): string {
  const buffer = Buffer.from(text, 'utf8');
  return encryptBuffer(buffer, secret).toString('base64');
}

export function decryptString(encryptedBase64: string, secret: string): string {
  const buffer = Buffer.from(encryptedBase64, 'base64');
  return decryptBuffer(buffer, secret).toString('utf8');
}

export function saveEncryptedFile(filePath: string, buffer: Buffer, secret: string): void {
  const encrypted = encryptBuffer(buffer, secret);
  fs.writeFileSync(filePath, encrypted);
}

export function readDecryptedFile(filePath: string, secret: string): Buffer {
  const encrypted = fs.readFileSync(filePath);
  return decryptBuffer(encrypted, secret);
}

export function hashString(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
