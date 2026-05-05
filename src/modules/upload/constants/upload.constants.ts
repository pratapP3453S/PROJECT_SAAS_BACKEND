/**
 * upload.constants — DI tokens for the upload feature module.
 *
 * Why two storage tokens (provider + registry)?
 *  STORAGE_PROVIDER_REGISTRY  : a Map<UploadProviderName, IStorageProvider> filled
 *                               by every concrete provider class registered in
 *                               UploadModule's `providers` array. Adding a new
 *                               provider is purely additive — declare its class
 *                               and add a registry-entry useFactory binding.
 *  STORAGE_PROVIDER           : resolves the active backend out of the registry
 *                               based on UploadConfigService.getActiveProvider().
 *                               Injected by UploadService.
 *
 * Why a separate PRESIGNED_URL_PROVIDER?
 *  Presigning is provider-specific (AWS SDK signature v4, Cloudinary HMAC,
 *  ImageKit token signing, etc.). Splitting it from STORAGE_PROVIDER keeps the
 *  responsibility narrow and lets a deployment use, say, S3 for storage but
 *  Cloudinary for transformations should that ever be desired.
 *
 * Usage
 *  // Register a storage provider in UploadModule:
 *  {
 *    provide: STORAGE_PROVIDER_REGISTRY,
 *    useFactory: (local, s3, r2, cloudinary, imagekit) =>
 *      new Map([
 *        ['local', local], ['s3', s3], ['cloudflare', r2],
 *        ['cloudinary', cloudinary], ['imagekit', imagekit],
 *      ]),
 *    inject: [LocalStorageProvider, S3StorageProvider, ...],
 *  }
 *
 *  // Inject the active provider:
 *  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider) {}
 */
export const STORAGE_PROVIDER = Symbol.for('upload:STORAGE_PROVIDER');
export const STORAGE_PROVIDER_REGISTRY = Symbol.for('upload:STORAGE_PROVIDER_REGISTRY');
export const PRESIGNED_URL_PROVIDER = Symbol.for('upload:PRESIGNED_URL_PROVIDER');
export const PRESIGNED_URL_PROVIDER_REGISTRY = Symbol.for('upload:PRESIGNED_URL_PROVIDER_REGISTRY');
