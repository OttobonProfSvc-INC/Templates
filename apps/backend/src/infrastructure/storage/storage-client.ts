import path from 'path';
import { StorageClient } from '@supabase/storage-js';
import {
  IStorageService,
  StorageObjectMetadata,
  StorageSignedUrlResult,
  StorageUploadOptions,
  StorageUploadResult,
} from './types';

export interface StorageClientConfig {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  defaultBucket?: string;
  /** Optional pre-configured client instance for unit testing / mocking */
  rawClient?: any;
}

/**
 * Server-only Supabase Storage Service.
 * 
 * Strict architectural boundaries:
 * - Bucket is PRIVATE.
 * - Zero public URL generation methods.
 * - Credentials must never reach frontend/browser code.
 * - Supports dependency injection for 100% network-free unit tests.
 */
export class SupabaseStorageService implements IStorageService {
  private rawClient: any;
  private defaultBucket: string;
  private supabaseUrl?: string;
  private serviceRoleKey?: string;

  constructor(config: StorageClientConfig = {}) {
    this.defaultBucket = config.defaultBucket || process.env.SBLOOM_STORAGE_BUCKET || 'sBLOOM_templateshub';
    this.supabaseUrl = config.supabaseUrl || process.env.SUPABASE_URL;
    this.serviceRoleKey = config.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (config.rawClient) {
      this.rawClient = config.rawClient;
    }
  }

  private getClient(): StorageClient {
    if (this.rawClient) {
      return this.rawClient;
    }

    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error(
        'Storage configuration error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for remote storage operations. Zero credentials found.'
      );
    }

    const storageEndpoint = this.supabaseUrl.replace(/\/+$/, '') + '/storage/v1';
    this.rawClient = new StorageClient(storageEndpoint, {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    });

    return this.rawClient;
  }

  public async objectExists(bucket: string, key: string): Promise<boolean> {
    const client = this.getClient();
    const folder = path.posix.dirname(key);
    const fileName = path.posix.basename(key);
    const searchFolder = folder === '.' ? '' : folder;

    const { data, error } = await client.from(bucket).list(searchFolder, {
      search: fileName,
      limit: 10,
    });

    if (error) {
      throw new Error(`Failed to check object existence at "${key}" in bucket "${bucket}": ${error.message}`);
    }

    if (!data || data.length === 0) {
      return false;
    }

    return data.some((item) => item.name === fileName);
  }

  public async getObjectMetadata(bucket: string, key: string): Promise<StorageObjectMetadata | null> {
    const client = this.getClient();
    const folder = path.posix.dirname(key);
    const fileName = path.posix.basename(key);
    const searchFolder = folder === '.' ? '' : folder;

    const { data, error } = await client.from(bucket).list(searchFolder, {
      search: fileName,
      limit: 10,
    });

    if (error) {
      throw new Error(`Failed to get object metadata for "${key}" in bucket "${bucket}": ${error.message}`);
    }

    const matched = data?.find((item) => item.name === fileName);
    if (!matched) {
      return null;
    }

    return {
      name: matched.name,
      bucket,
      storageKey: key,
      sizeBytes: matched.metadata?.size || 0,
      mimetype: matched.metadata?.mimetype || 'application/octet-stream',
      eTag: matched.metadata?.eTag,
      lastModified: matched.updated_at || matched.created_at || undefined,
      customMetadata: matched.metadata || undefined,
    };
  }

  public async uploadObject(
    bucket: string,
    key: string,
    file: Buffer,
    options: StorageUploadOptions = {}
  ): Promise<StorageUploadResult> {
    const client = this.getClient();
    const { data, error } = await client.from(bucket).upload(key, file, {
      contentType: options.contentType || 'application/octet-stream',
      cacheControl: options.cacheControl || 'max-age=3600',
      upsert: options.upsert ?? false,
      metadata: options.metadata,
    });

    if (error) {
      throw new Error(`Failed to upload storage object to "${key}" in bucket "${bucket}": ${error.message}`);
    }

    return {
      success: true,
      storageKey: key,
      bucket,
      eTag: (data as any)?.id,
    };
  }

  public async createSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number = 900
  ): Promise<StorageSignedUrlResult> {
    if (expiresInSeconds <= 0 || expiresInSeconds > 86400) {
      throw new Error(`Invalid expiresInSeconds: ${expiresInSeconds}. Must be between 1 and 86400 seconds (24h).`);
    }

    const client = this.getClient();
    const { data, error } = await client.from(bucket).createSignedUrl(key, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to generate signed URL for "${key}" in bucket "${bucket}": ${error?.message || 'Empty response'}`);
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return {
      signedUrl: data.signedUrl,
      storageKey: key,
      bucket,
      expiresInSeconds,
      expiresAt,
    };
  }

  public async deleteObject(bucket: string, key: string): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from(bucket).remove([key]);

    if (error) {
      // Idempotency: If object is already missing (404 / NoSuchKey), treat as success
      if (
        error.message?.includes('not found') ||
        error.message?.includes('NoSuchKey') ||
        (error as any).status === 404
      ) {
        return;
      }
      throw new Error(`Failed to delete storage object "${key}" from bucket "${bucket}": ${error.message}`);
    }
  }
}
