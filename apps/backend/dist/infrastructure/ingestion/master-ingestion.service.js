"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterTemplateIngestionService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const supabase_1 = require("../supabase");
const storage_1 = require("../storage");
const local_executor_1 = require("./local-executor");
const app_error_1 = require("../../common/errors/app-error");
class MasterTemplateIngestionService {
    storageService;
    clientOverride;
    bucketName;
    constructor(options = {}) {
        this.bucketName = options.bucketName || process.env.SBLOOM_STORAGE_BUCKET || local_executor_1.CANONICAL_STORAGE_BUCKET;
        this.storageService = options.storageService || new storage_1.SupabaseStorageService({ defaultBucket: this.bucketName });
        this.clientOverride = options.supabaseClient;
    }
    resolveClient() {
        return this.clientOverride || (0, supabase_1.getSupabaseServerClient)();
    }
    /**
     * Ingests a single validated master template.
     *
     * Strict Architectural Boundaries:
     * 1. Supabase Storage and PostgreSQL do NOT share a transaction.
     * 2. Step 1: Upload object to Storage (idempotent / skip if identical object exists).
     * 3. Step 2: Call public.ingest_master_template RPC for atomic database metadata.
     * 4. Step 3: If database RPC fails after upload succeeded in this run, execute safe compensation
     *    (attempt immediate deletion, fallback to queuing into storage_deletion_jobs_templatedhub).
     */
    async ingestTemplate(record, actorId, options = {}) {
        const dryRun = options.dryRun ?? false;
        const bucket = options.bucketName || this.bucketName;
        const storageService = options.storageService || this.storageService;
        const client = options.supabaseClient || this.resolveClient();
        const primaryFile = record.files[0];
        if (!primaryFile) {
            throw new app_error_1.AppError(`Template record "${record.asset.slug}" contains no primary file definition.`, {
                code: 'INGESTION_FILE_MISSING',
                httpStatus: 400,
            });
        }
        // 1. Dry-Run Branch: Zero remote writes, zero storage network access
        if (dryRun) {
            return {
                status: 'WOULD_INGEST',
                dryRun: true,
                assetId: record.asset.id,
                revisionId: record.revision.id,
                fileId: primaryFile.id,
                revisionNumber: 1,
                slug: record.asset.slug,
                storageKey: primaryFile.storageKey,
                storageUploaded: false,
                message: `DRY-RUN: Master template "${record.asset.slug}" would be ingested into database and storage (0 writes performed).`,
            };
        }
        // 2. Read local file buffer
        const resolvedPath = path_1.default.isAbsolute(record.sourcePath)
            ? record.sourcePath
            : [
                path_1.default.resolve(process.cwd(), record.sourcePath),
                path_1.default.resolve(process.cwd(), '../../', record.sourcePath),
                path_1.default.resolve(__dirname, '../../../../../', record.sourcePath),
            ].find(p => fs_1.default.existsSync(p)) || path_1.default.resolve(process.cwd(), record.sourcePath);
        if (!fs_1.default.existsSync(resolvedPath)) {
            throw new app_error_1.AppError(`Source image file not found on disk: "${record.sourcePath}" (resolved: "${resolvedPath}")`, {
                code: 'SOURCE_FILE_NOT_FOUND',
                httpStatus: 404,
            });
        }
        const fileBuffer = fs_1.default.readFileSync(resolvedPath);
        // 3. Storage Upload Step (non-transactional boundary)
        let storageUploadedInThisRun = false;
        const objectAlreadyExists = await storageService.objectExists(bucket, primaryFile.storageKey);
        if (!objectAlreadyExists) {
            await storageService.uploadObject(bucket, primaryFile.storageKey, fileBuffer, {
                contentType: primaryFile.mimeType,
                upsert: false,
            });
            storageUploadedInThisRun = true;
        }
        // 4. Database Ingestion RPC Step (atomic PostgreSQL transaction)
        try {
            const { data, error } = await client.rpc('ingest_master_template', {
                p_asset_id: record.asset.id,
                p_slug: record.asset.slug,
                p_legacy_id: record.asset.legacyId,
                p_import_source: record.asset.importSource,
                p_asset_type_code: record.asset.typeCode,
                p_is_featured: record.asset.isFeatured,
                p_actor_id: actorId,
                p_title: record.revision.title,
                p_description: record.revision.description,
                p_metadata: record.revision.metadata,
                p_schema_version: record.revision.schemaVersion,
                p_file_id: primaryFile.id,
                p_storage_key: primaryFile.storageKey,
                p_file_name: primaryFile.fileName,
                p_mime_type: primaryFile.mimeType,
                p_size_bytes: primaryFile.sizeBytes,
                p_checksum_sha256: primaryFile.checksumSha256,
                p_publish_immediately: true,
            });
            if (error) {
                throw (0, supabase_1.mapPostgrestRpcError)(error, `MasterTemplateIngestionService.ingestTemplate(${record.asset.slug})`);
            }
            const payload = Array.isArray(data) ? data[0] : data;
            if (!payload || typeof payload !== 'object') {
                throw new app_error_1.AppError('ingest_master_template routine did not return expected response payload.', {
                    code: 'INGESTION_MALFORMED_RESPONSE',
                    httpStatus: 500,
                });
            }
            return {
                status: payload.status,
                dryRun: false,
                assetId: payload.asset_id ?? record.asset.id,
                revisionId: payload.revision_id,
                fileId: payload.file_id,
                revisionNumber: payload.revision_number ?? 1,
                slug: payload.slug ?? record.asset.slug,
                storageKey: payload.storage_key ?? primaryFile.storageKey,
                storageUploaded: storageUploadedInThisRun,
                message: payload.message || `Master template "${record.asset.slug}" successfully ingested.`,
            };
        }
        catch (dbError) {
            // 5. Compensation Step: If database RPC fails after a new upload, compensate storage
            if (storageUploadedInThisRun) {
                try {
                    await storageService.deleteObject(bucket, primaryFile.storageKey);
                }
                catch (cleanupError) {
                    // If immediate deletion fails, enqueue into storage_deletion_jobs_templatedhub
                    try {
                        await client.from('storage_deletion_jobs_templatedhub').insert({
                            storage_key: primaryFile.storageKey,
                            bucket_name: bucket,
                            status: 'PENDING',
                            attempts: 0,
                        });
                    }
                    catch {
                        // Log/ignore secondary enqueue failure to rethrow primary dbError
                    }
                }
            }
            throw dbError;
        }
    }
    /**
     * Ingests a batch of prepared local asset records sequentially.
     */
    async ingestBatch(records, actorId, options = {}) {
        const results = [];
        const errors = [];
        let createdCount = 0;
        let alreadyIngestedCount = 0;
        for (const record of records) {
            try {
                const itemResult = await this.ingestTemplate(record, actorId, options);
                results.push(itemResult);
                if (itemResult.status === 'CREATED' || itemResult.status === 'WOULD_INGEST') {
                    createdCount++;
                }
                else if (itemResult.status === 'ALREADY_INGESTED') {
                    alreadyIngestedCount++;
                }
            }
            catch (err) {
                errors.push({
                    slug: record.asset.slug,
                    error: err?.cause?.message || err?.message || String(err),
                });
            }
        }
        return {
            total: records.length,
            createdCount,
            alreadyIngestedCount,
            failedCount: errors.length,
            results,
            errors,
        };
    }
}
exports.MasterTemplateIngestionService = MasterTemplateIngestionService;
