import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CreateAssetPayload,
  TemplateDto,
  TemplateDocument,
  SourceClassification,
} from '@sbloom/contracts';
import { getDatabaseClient } from '../../config/database';
import { isDatabaseMode, config } from '../../config/env';
import { getSupabaseServerClient } from '../../infrastructure/supabase';
import { systemActorService } from '../../infrastructure/system-actor/system-actor.service';
import { CANONICAL_STORAGE_BUCKET, CANONICAL_STORAGE_ROOT } from '../../infrastructure/ingestion';
import { SupabaseStorageService } from '../../infrastructure/storage';
import { inMemoryTemplateStore } from '../../template-store';
import { normalizeFilenameSlug } from '../../infrastructure/ingestion/key-generator';
import { BadRequestError, InternalError } from '../../common/errors';
import { logger } from '../../common/logger';

export interface CreateAssetResult extends TemplateDto {
  storageResult: {
    uploaded: boolean;
    storageKey: string;
    bucket: string;
    status: 'STORED_REMOTE' | 'STORAGE_CREDENTIALS_UNCONFIGURED' | 'FAILED';
    message?: string;
  };
  databaseResult: {
    status: 'COMMITTED' | 'IN_MEMORY_FALLBACK';
    assetId: string;
    revisionId: string;
    fileId: string;
  };
}

/**
 * Resolves the root directory of the template-library
 */
function resolveTemplateLibraryDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'template-library/social-media'),
    path.resolve(process.cwd(), '../../template-library/social-media'),
    path.resolve(__dirname, '../../../../../template-library/social-media'),
    path.resolve(__dirname, '../../../../template-library/social-media'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), '../../template-library/social-media');
}

export class AssetService {
  private storageService: SupabaseStorageService;

  constructor(storageService?: SupabaseStorageService) {
    this.storageService = storageService || new SupabaseStorageService({
      defaultBucket: process.env.SBLOOM_STORAGE_BUCKET || CANONICAL_STORAGE_BUCKET,
    });
  }

  /**
   * Creates a new Master Asset adhering to Phase 2 semantics:
   * 1. Decodes and validates primary file payload (JPG, JPEG, PNG, WEBP).
   * 2. Computes SHA-256 checksum and size.
   * 3. Generates canonical storage key (templates/social-media/<category>/<filename>).
   * 4. Attempts cloud storage upload:
   *    - If server credentials (SUPABASE_SERVICE_ROLE_KEY) are missing, identifies blocker without inventing credentials.
   * 5. Saves file to local asset store for development preview serving.
   * 6. Executes direct PostgreSQL runtime transaction:
   *    Asset -> Revision #1 -> AssetFile -> AuditEvent atomicity via public.ingest_master_template + public.publish_asset_revision.
   *    - In dev mode without direct DB credentials, gracefully registers in inMemoryTemplateStore.
   * 7. Returns standardized TemplateDto representation.
   */
  public async createMasterAsset(
    payload: CreateAssetPayload,
    actorId: string = '00000000-0000-0000-0000-000000000001'
  ): Promise<CreateAssetResult> {
    // 1. Decode binary buffer from base64
    const base64Data = payload.fileData.includes('base64,')
      ? payload.fileData.split('base64,')[1]
      : payload.fileData;

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(base64Data, 'base64');
    } catch {
      throw new BadRequestError('Invalid file data: could not decode base64 buffer.');
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestError('Primary file buffer cannot be empty.');
    }

    // 2. Compute metadata
    const sizeBytes = fileBuffer.length;
    const checksumSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const assetId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const fileId = crypto.randomUUID();

    // 3. Category & filename normalization
    const rawCategory = payload.category.trim();
    const categoryNormalized = rawCategory.toLowerCase();
    const categoryCapitalized = rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);

    const safeFileName = normalizeFilenameSlug(payload.fileName, checksumSha256);
    const storageKey = `${CANONICAL_STORAGE_ROOT}/${categoryNormalized}/${safeFileName}`;

    // Normalize slug
    const titleSlug = payload.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const uniqueSlugSuffix = assetId.slice(0, 8);
    const slug = `${categoryNormalized}-${titleSlug || 'asset'}-${uniqueSlugSuffix}`;

    // 4. File Storage Step
    const bucket = process.env.SBLOOM_STORAGE_BUCKET || CANONICAL_STORAGE_BUCKET;
    let storageStatus: 'STORED_REMOTE' | 'STORAGE_CREDENTIALS_UNCONFIGURED' | 'FAILED' = 'STORAGE_CREDENTIALS_UNCONFIGURED';
    let storageMessage = 'SUPABASE_SERVICE_ROLE_KEY is unconfigured in backend environment; remote private storage upload was bypassed.';

    const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (hasServiceRoleKey) {
      try {
        await this.storageService.uploadObject(bucket, storageKey, fileBuffer, {
          contentType: payload.mimeType,
          upsert: true,
        });
        storageStatus = 'STORED_REMOTE';
        storageMessage = `Successfully uploaded to bucket "${bucket}" at "${storageKey}".`;
      } catch (uploadErr: any) {
        logger.error('Failed to upload file to cloud storage', uploadErr);
        if (isDatabaseMode() && process.env.NODE_ENV === 'production') {
          throw new InternalError(`Cloud storage upload failed: ${uploadErr?.message || uploadErr}`);
        }
        storageStatus = 'FAILED';
        storageMessage = `Storage upload failed: ${uploadErr?.message || uploadErr}`;
      }
    } else {
      logger.warn('[AssetService] SUPABASE_SERVICE_ROLE_KEY missing. Server-side storage upload deferred.');
    }

    // 5. Local preview storage (enables instant preview serving via /api/assets/raw/:category/:filename)
    try {
      const baseDir = resolveTemplateLibraryDir();
      const targetCategoryDir = path.resolve(baseDir, 'uploads', categoryCapitalized);
      if (!fs.existsSync(targetCategoryDir)) {
        fs.mkdirSync(targetCategoryDir, { recursive: true });
      }
      const localFilePath = path.resolve(targetCategoryDir, safeFileName);
      fs.writeFileSync(localFilePath, fileBuffer);
    } catch (fsErr: any) {
      logger.warn('[AssetService] Could not cache asset locally for static raw serving', { error: String(fsErr?.message || fsErr) });
    }

    // 6. Build Structured Document & Metadata
    const isCustomizable = payload.isCustomizable ?? false;
    const classification: SourceClassification = isCustomizable
      ? 'STRUCTURED_TEMPLATE'
      : (payload.classification || 'FLAT_IMAGE');

    const heroImageSrc = `/api/assets/raw/${encodeURIComponent(categoryCapitalized)}/${encodeURIComponent(safeFileName)}`;

    let document: TemplateDocument;
    if ((payload as any).document) {
      document = (payload as any).document;
    } else if (isCustomizable) {
      document = {
        documentVersion: 1,
        canvas: {
          width: payload.width,
          height: payload.height,
          backgroundColor: '#0f172a',
        },
        elements: [
          {
            id: 'el-heading',
            type: 'text',
            name: 'Headline',
            x: Math.round(payload.width * 0.08),
            y: Math.round(payload.height * 0.06),
            width: Math.round(payload.width * 0.84),
            height: 140,
            text: payload.title || 'ADMISSIONS OPEN 2026-27',
            fontSize: 52,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#fbbf24',
            textAlign: 'center',
            zIndex: 2,
            isEditable: true,
            isLocked: false,
            isVisible: true,
          },
          {
            id: 'el-hero-image',
            type: 'image',
            name: 'Hero Graphic',
            x: Math.round(payload.width * 0.08),
            y: Math.round(payload.height * 0.22),
            width: Math.round(payload.width * 0.84),
            height: Math.round(payload.height * 0.46),
            src: heroImageSrc,
            objectFit: 'cover',
            zIndex: 1,
            isLocked: false,
            isVisible: true,
            isReplaceable: true,
          },
          {
            id: 'el-subheading',
            type: 'text',
            name: 'Subheading & Details',
            x: Math.round(payload.width * 0.08),
            y: Math.round(payload.height * 0.72),
            width: Math.round(payload.width * 0.84),
            height: 80,
            text: payload.description || 'Excellence in Academics, Sports & Leadership. Enroll Today!',
            fontSize: 26,
            fontFamily: 'Inter, sans-serif',
            fontWeight: '600',
            color: '#ffffff',
            textAlign: 'center',
            zIndex: 3,
            isEditable: true,
            isLocked: false,
            isVisible: true,
          },
          {
            id: 'el-cta-shape',
            type: 'shape',
            name: 'CTA Button Background',
            x: Math.round(payload.width * 0.3),
            y: Math.round(payload.height * 0.84),
            width: Math.round(payload.width * 0.4),
            height: 80,
            shapeType: 'rectangle',
            backgroundColor: '#e11d48',
            borderColor: '#ffffff',
            borderWidth: 2,
            borderRadius: 16,
            zIndex: 4,
            isLocked: false,
            isVisible: true,
          },
          {
            id: 'el-cta-text',
            type: 'text',
            name: 'CTA Button Text',
            x: Math.round(payload.width * 0.3),
            y: Math.round(payload.height * 0.84) + 20,
            width: Math.round(payload.width * 0.4),
            height: 40,
            text: 'ENROLL NOW',
            fontSize: 24,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            zIndex: 5,
            isEditable: true,
            isLocked: false,
            isVisible: true,
          },
        ],
      };
    } else {
      document = {
        documentVersion: 1,
        canvas: {
          width: payload.width,
          height: payload.height,
          backgroundColor: '#ffffff',
          backgroundImageUrl: heroImageSrc,
        },
        elements: [],
      };
    }

    // Attach customizability flag inside metadata
    (document as any).isCustomizable = isCustomizable;
    (document as any).classification = classification;

    // 7. Atomic Database Ingestion
    let dbStatus: 'COMMITTED' | 'IN_MEMORY_FALLBACK' = 'IN_MEMORY_FALLBACK';
    const isDb = isDatabaseMode();

    if (isDb) {
      try {
        let effectiveActorId = actorId;
        if (effectiveActorId === '00000000-0000-0000-0000-000000000001') {
          try {
            const systemActor = await systemActorService.getSystemActor();
            effectiveActorId = systemActor.id;
          } catch {
            // Keep passed actorId
          }
        }

        if (config.supabaseServiceRoleKey) {
          const supabase = getSupabaseServerClient();
          const { data, error } = await supabase.rpc('ingest_master_template', {
            p_asset_id: assetId,
            p_slug: slug,
            p_legacy_id: `upload-${safeFileName}`,
            p_import_source: 'manual-upload',
            p_asset_type_code: payload.assetTypeCode || 'social-post',
            p_is_featured: false,
            p_actor_id: effectiveActorId,
            p_title: payload.title,
            p_description: payload.description || '',
            p_metadata: document,
            p_schema_version: 1,
            p_file_id: fileId,
            p_storage_key: storageKey,
            p_file_name: safeFileName,
            p_mime_type: payload.mimeType,
            p_size_bytes: sizeBytes,
            p_checksum_sha256: checksumSha256,
            p_publish_immediately: true,
          });

          if (error) {
            throw new Error(`Supabase ingest error: ${error.message}`);
          }

          dbStatus = 'COMMITTED';
          logger.info(`[AssetService] Atomically ingested and published master asset in Supabase: ${slug} (${assetId})`);
        } else {
          const client = getDatabaseClient();
          // Invoke atomic PostgreSQL stored function: public.ingest_master_template
          await client.$queryRaw`
            SELECT public.ingest_master_template(
              ${assetId}::uuid,
              ${slug}::text,
              ${`upload-${safeFileName}`}::text,
              ${'manual-upload'}::text,
              ${payload.assetTypeCode || 'social-post'}::text,
              false::boolean,
              ${effectiveActorId}::uuid,
              ${payload.title}::text,
              ${payload.description || ''}::text,
              ${JSON.stringify(document)}::jsonb,
              1::int,
              ${fileId}::uuid,
              ${storageKey}::text,
              ${safeFileName}::text,
              ${payload.mimeType}::text,
              ${BigInt(sizeBytes)},
              ${checksumSha256}::text
            ) as result
          `;

          // Automatically publish Revision #1 so the asset is immediately discoverable in Library
          await client.$queryRaw`
            SELECT public.publish_asset_revision(
              ${assetId}::uuid,
              ${revisionId}::uuid
            ) as result
          `;

          dbStatus = 'COMMITTED';
          logger.info(`[AssetService] Atomically committed and published master asset in PostgreSQL: ${slug} (${assetId})`);
        }
      } catch (dbErr: any) {
        logger.error('[AssetService] Database commit error for asset:', dbErr);
        if (process.env.NODE_ENV === 'production') {
          throw new InternalError(`Failed to persist asset to PostgreSQL: ${dbErr?.message || dbErr}`);
        }
        // In development/test mode without live DB, fallback to TemplateRegistry
        dbStatus = 'IN_MEMORY_FALLBACK';
      }
    }

    // 8. Register in TemplateRegistry for immediate library query availability
    const templateDto: TemplateDto = {
      id: assetId,
      slug,
      title: payload.title,
      description: payload.description || '',
      category: categoryCapitalized,
      assetType: payload.assetTypeCode || 'social-post',
      classification,
      thumbnailUrl: `/api/assets/raw/${encodeURIComponent(categoryCapitalized)}/${encodeURIComponent(safeFileName)}`,
      dimensions: {
        width: payload.width,
        height: payload.height,
      },
      isCustomizable,
      publishedRevisionId: revisionId,
      createdAt: new Date().toISOString(),
      document,
    };

    inMemoryTemplateStore.addTemplate(templateDto);

    return {
      ...templateDto,
      storageResult: {
        uploaded: storageStatus === 'STORED_REMOTE',
        storageKey,
        bucket,
        status: storageStatus,
        message: storageMessage,
      },
      databaseResult: {
        status: dbStatus,
        assetId,
        revisionId,
        fileId,
      },
    };
  }
}

export const assetService = new AssetService();
