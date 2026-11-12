/**
 * Server-only Supabase Storage and Ingestion Types.
 * 
 * Strict architectural boundaries:
 * - Bucket sBLOOM_templateshub is PRIVATE.
 * - Zero public URL generation methods.
 * - Credentials and service_role keys must never reach frontend/browser contexts.
 */

export interface StorageObjectMetadata {
  name: string;
  bucket: string;
  storageKey: string;
  sizeBytes: number;
  mimetype: string;
  eTag?: string;
  lastModified?: string;
  customMetadata?: Record<string, any>;
}

export interface StorageUploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
  metadata?: Record<string, any>;
}

export interface StorageUploadResult {
  success: boolean;
  storageKey: string;
  bucket: string;
  eTag?: string;
}

export interface StorageSignedUrlResult {
  signedUrl: string;
  storageKey: string;
  bucket: string;
  expiresInSeconds: number;
  expiresAt: string;
}

/**
 * Server-only Storage abstraction contract.
 */
export interface IStorageService {
  /**
   * Checks whether an object exists in the specified bucket at the given key.
   */
  objectExists(bucket: string, key: string): Promise<boolean>;

  /**
   * Retrieves object metadata without downloading full payload.
   */
  getObjectMetadata(bucket: string, key: string): Promise<StorageObjectMetadata | null>;

  /**
   * Server-side upload to private storage bucket.
   */
  uploadObject(
    bucket: string,
    key: string,
    file: Buffer,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult>;

  /**
   * Creates a time-limited cryptographically signed URL for authorized access.
   * Never generates permanent public URLs.
   */
  createSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds?: number
  ): Promise<StorageSignedUrlResult>;

  /**
   * Idempotently deletes an object from storage. Missing objects are treated as success.
   */
  deleteObject(bucket: string, key: string): Promise<void>;
}

/**
 * Pure checksum reconciliation states.
 */
export enum ReconciliationStatus {
  /** Object does not exist remotely; eligible for initial upload */
  UPLOAD_CANDIDATE = 'UPLOAD_CANDIDATE',
  /** Object exists remotely with identical SHA-256; re-upload skipped */
  ALREADY_EXISTS_VERIFIED = 'ALREADY_EXISTS_VERIFIED',
  /** Object exists remotely but SHA-256 differs; content conflict */
  CONTENT_CONFLICT = 'CONTENT_CONFLICT',
}

export interface ReconciliationDecision {
  status: ReconciliationStatus;
  storageKey: string;
  localSha256: string;
  remoteSha256?: string;
  reason: string;
}
