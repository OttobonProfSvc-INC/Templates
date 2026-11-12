"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetService = exports.AssetService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const supabase_1 = require("../../infrastructure/supabase");
const system_actor_service_1 = require("../../infrastructure/system-actor/system-actor.service");
const ingestion_1 = require("../../infrastructure/ingestion");
const storage_1 = require("../../infrastructure/storage");
const template_store_1 = require("../../template-store");
const key_generator_1 = require("../../infrastructure/ingestion/key-generator");
const errors_1 = require("../../common/errors");
const logger_1 = require("../../common/logger");
/**
 * Resolves the root directory of the template-library
 */
function resolveTemplateLibraryDir() {
    const candidates = [
        path_1.default.resolve(process.cwd(), 'template-library/social-media'),
        path_1.default.resolve(process.cwd(), '../../template-library/social-media'),
        path_1.default.resolve(__dirname, '../../../../../template-library/social-media'),
        path_1.default.resolve(__dirname, '../../../../template-library/social-media'),
    ];
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return path_1.default.resolve(process.cwd(), '../../template-library/social-media');
}
class AssetService {
    storageService;
    constructor(storageService) {
        this.storageService = storageService || new storage_1.SupabaseStorageService({
            defaultBucket: process.env.SBLOOM_STORAGE_BUCKET || ingestion_1.CANONICAL_STORAGE_BUCKET,
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
    async createMasterAsset(payload, actorId = '00000000-0000-0000-0000-000000000001') {
        // 1. Decode binary buffer from base64
        const base64Data = payload.fileData.includes('base64,')
            ? payload.fileData.split('base64,')[1]
            : payload.fileData;
        let fileBuffer;
        try {
            fileBuffer = Buffer.from(base64Data, 'base64');
        }
        catch {
            throw new errors_1.BadRequestError('Invalid file data: could not decode base64 buffer.');
        }
        if (!fileBuffer || fileBuffer.length === 0) {
            throw new errors_1.BadRequestError('Primary file buffer cannot be empty.');
        }
        // 2. Compute metadata
        const sizeBytes = fileBuffer.length;
        const checksumSha256 = crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
        const assetId = crypto_1.default.randomUUID();
        const revisionId = crypto_1.default.randomUUID();
        const fileId = crypto_1.default.randomUUID();
        // 3. Category & filename normalization
        const rawCategory = payload.category.trim();
        const categoryNormalized = rawCategory.toLowerCase();
        const categoryCapitalized = rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);
        const safeFileName = (0, key_generator_1.normalizeFilenameSlug)(payload.fileName, checksumSha256);
        const storageKey = `${ingestion_1.CANONICAL_STORAGE_ROOT}/${categoryNormalized}/${safeFileName}`;
        // Normalize slug
        const titleSlug = payload.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40);
        const uniqueSlugSuffix = assetId.slice(0, 8);
        const slug = `${categoryNormalized}-${titleSlug || 'asset'}-${uniqueSlugSuffix}`;
        // 4. File Storage Step
        const bucket = process.env.SBLOOM_STORAGE_BUCKET || ingestion_1.CANONICAL_STORAGE_BUCKET;
        let storageStatus = 'STORAGE_CREDENTIALS_UNCONFIGURED';
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
            }
            catch (uploadErr) {
                logger_1.logger.error('Failed to upload file to cloud storage', uploadErr);
                if ((0, env_1.isDatabaseMode)() && process.env.NODE_ENV === 'production') {
                    throw new errors_1.InternalError(`Cloud storage upload failed: ${uploadErr?.message || uploadErr}`);
                }
                storageStatus = 'FAILED';
                storageMessage = `Storage upload failed: ${uploadErr?.message || uploadErr}`;
            }
        }
        else {
            logger_1.logger.warn('[AssetService] SUPABASE_SERVICE_ROLE_KEY missing. Server-side storage upload deferred.');
        }
        // 5. Local preview storage (enables instant preview serving via /api/assets/raw/:category/:filename)
        try {
            const baseDir = resolveTemplateLibraryDir();
            const targetCategoryDir = path_1.default.resolve(baseDir, 'uploads', categoryCapitalized);
            if (!fs_1.default.existsSync(targetCategoryDir)) {
                fs_1.default.mkdirSync(targetCategoryDir, { recursive: true });
            }
            const localFilePath = path_1.default.resolve(targetCategoryDir, safeFileName);
            fs_1.default.writeFileSync(localFilePath, fileBuffer);
        }
        catch (fsErr) {
            logger_1.logger.warn('[AssetService] Could not cache asset locally for static raw serving', { error: String(fsErr?.message || fsErr) });
        }
        // 6. Build Structured Document & Metadata
        const isCustomizable = payload.isCustomizable ?? false;
        const classification = isCustomizable
            ? 'STRUCTURED_TEMPLATE'
            : (payload.classification || 'FLAT_IMAGE');
        const heroImageSrc = `/api/assets/raw/${encodeURIComponent(categoryCapitalized)}/${encodeURIComponent(safeFileName)}`;
        let document;
        if (payload.document) {
            document = payload.document;
        }
        else if (isCustomizable) {
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
        }
        else {
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
        document.isCustomizable = isCustomizable;
        document.classification = classification;
        // 7. Atomic Database Ingestion
        let dbStatus = 'IN_MEMORY_FALLBACK';
        const isDb = (0, env_1.isDatabaseMode)();
        if (isDb) {
            try {
                let effectiveActorId = actorId;
                if (effectiveActorId === '00000000-0000-0000-0000-000000000001') {
                    try {
                        const systemActor = await system_actor_service_1.systemActorService.getSystemActor();
                        effectiveActorId = systemActor.id;
                    }
                    catch {
                        // Keep passed actorId
                    }
                }
                if (env_1.config.supabaseServiceRoleKey) {
                    const supabase = (0, supabase_1.getSupabaseServerClient)();
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
                    logger_1.logger.info(`[AssetService] Atomically ingested and published master asset in Supabase: ${slug} (${assetId})`);
                }
                else {
                    const client = (0, database_1.getDatabaseClient)();
                    // Invoke atomic PostgreSQL stored function: public.ingest_master_template
                    await client.$queryRaw `
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
                    await client.$queryRaw `
            SELECT public.publish_asset_revision(
              ${assetId}::uuid,
              ${revisionId}::uuid
            ) as result
          `;
                    dbStatus = 'COMMITTED';
                    logger_1.logger.info(`[AssetService] Atomically committed and published master asset in PostgreSQL: ${slug} (${assetId})`);
                }
            }
            catch (dbErr) {
                logger_1.logger.error('[AssetService] Database commit error for asset:', dbErr);
                if (process.env.NODE_ENV === 'production') {
                    throw new errors_1.InternalError(`Failed to persist asset to PostgreSQL: ${dbErr?.message || dbErr}`);
                }
                // In development/test mode without live DB, fallback to TemplateRegistry
                dbStatus = 'IN_MEMORY_FALLBACK';
            }
        }
        // 8. Register in TemplateRegistry for immediate library query availability
        const templateDto = {
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
        template_store_1.inMemoryTemplateStore.addTemplate(templateDto);
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
exports.AssetService = AssetService;
exports.assetService = new AssetService();
