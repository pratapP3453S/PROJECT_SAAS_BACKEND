/**
 * upload.constants — DI tokens for the upload feature module.
 *
 * STORAGE_PROVIDER:
 *  Injection token for the IStorageProvider implementation.
 *  Used with @Inject(STORAGE_PROVIDER) in UploadService so the concrete
 *  storage backend (local disk, S3, Cloudinary, etc.) can be swapped by
 *  changing a single `provide` binding in UploadModule — zero changes to
 *  UploadService or UploadController.
 *
 * Usage:
 *  // bind in UploadModule:
 *  { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider }
 *
 *  // inject in UploadService:
 *  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider)
 *
 * Extending to a new backend (e.g. S3):
 *  1. Create S3StorageProvider implements IStorageProvider.
 *  2. In UploadModule change useClass: LocalStorageProvider → useClass: S3StorageProvider.
 *  3. No other files change.
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
