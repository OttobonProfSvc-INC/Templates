import fs from 'fs';
import path from 'path';
import {
  MasterTemplateIngestionService,
  MasterIngestionItemResult,
} from '../infrastructure/ingestion/master-ingestion.service';
import { PreparedLocalAssetRecord } from '../infrastructure/ingestion/local-executor';
import { ForbiddenError } from '../common/errors/forbidden.error';
import { ConflictError } from '../common/errors/conflict.error';
import { AppError } from '../common/errors/app-error';

describe('API-6 — Master Ingestion Supabase RPC & Storage Orchestration Tests (Tasks 26 & 27)', () => {
  let mockStorageService: any;
  let mockSupabaseClient: any;
  let sampleRecord: PreparedLocalAssetRecord;
  let tempImagePath: string;

  beforeAll(() => {
    // Create a temporary dummy file on disk for unit test reading
    tempImagePath = path.resolve(__dirname, 'temp_test_image.jpg');
    fs.writeFileSync(tempImagePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
  });

  afterAll(() => {
    if (fs.existsSync(tempImagePath)) {
      fs.unlinkSync(tempImagePath);
    }
  });

  beforeEach(() => {
    mockStorageService = {
      objectExists: jest.fn(),
      uploadObject: jest.fn(),
      deleteObject: jest.fn(),
      getObjectMetadata: jest.fn(),
    };

    mockSupabaseClient = {
      rpc: jest.fn(),
      from: jest.fn(),
    };

    sampleRecord = {
      sourceCategory: 'Coaching',
      originalFileName: '1.jpg',
      sourcePath: tempImagePath,
      asset: {
        id: '11111111-2222-3333-4444-555555555555',
        slug: 'coaching-post-1',
        legacyId: 'local-coaching-1.jpg',
        importSource: 'template-library/social-media',
        typeCode: 'social-post',
        status: 'DRAFT',
        lastRevisionNumber: 1,
        isFeatured: true,
        creatorIdPlaceholder: 'ACTOR_ID',
      },
      revision: {
        id: '22222222-3333-4444-5555-666666666666',
        revisionNumber: 1,
        title: 'Coaching - Template 1',
        description: 'Customizable social media post design for Coaching.',
        metadata: {
          documentVersion: 1,
          canvas: {
            width: 1080,
            height: 1080,
            backgroundColor: '#ffffff',
            backgroundImageUrl: '/api/assets/raw/Coaching/1.jpg',
          },
          elements: [],
        },
        schemaVersion: 1,
        status: 'DRAFT',
        createdByIdPlaceholder: 'ACTOR_ID',
      },
      files: [
        {
          id: '33333333-4444-5555-6666-777777777777',
          storageKey: 'templates/social-media/coaching/1.jpg',
          fileName: '1.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          role: 'PRIMARY_ENTRY',
          isEntryPoint: true,
        },
      ],
      validation: {
        status: 'VALID',
        width: 1080,
        height: 1080,
        aspectRatio: 1,
        detectedFormat: 'jpeg',
      },
    };
  });

  // ===========================================================================
  // TASK 26 — MASTER INGESTION RPC GATEWAY TESTS
  // ===========================================================================
  describe('ingest_master_template RPC Gateway', () => {
    it('invokes exact RPC name "ingest_master_template" with complete canonical payload', async () => {
      mockStorageService.objectExists.mockResolvedValue(false);
      mockStorageService.uploadObject.mockResolvedValue({ success: true });

      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          status: 'CREATED',
          asset_id: sampleRecord.asset.id,
          revision_id: sampleRecord.revision.id,
          file_id: sampleRecord.files[0].id,
          revision_number: 1,
          slug: sampleRecord.asset.slug,
          storage_key: sampleRecord.files[0].storageKey,
          message: 'Master template "coaching-post-1" successfully ingested with revision #1.',
        },
        error: null,
      });

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      const actorId = '99999999-8888-7777-6666-555555555555';
      const result = await service.ingestTemplate(sampleRecord, actorId, { dryRun: false });

      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('ingest_master_template', {
        p_asset_id: sampleRecord.asset.id,
        p_slug: 'coaching-post-1',
        p_legacy_id: 'local-coaching-1.jpg',
        p_import_source: 'template-library/social-media',
        p_asset_type_code: 'social-post',
        p_is_featured: true,
        p_actor_id: actorId,
        p_title: 'Coaching - Template 1',
        p_description: 'Customizable social media post design for Coaching.',
        p_metadata: sampleRecord.revision.metadata,
        p_schema_version: 1,
        p_file_id: sampleRecord.files[0].id,
        p_storage_key: 'templates/social-media/coaching/1.jpg',
        p_file_name: '1.jpg',
        p_mime_type: 'image/jpeg',
        p_size_bytes: 1024,
        p_checksum_sha256: sampleRecord.files[0].checksumSha256,
        p_publish_immediately: true,
      });

      expect(result.status).toBe('CREATED');
      expect(result.assetId).toBe(sampleRecord.asset.id);
      expect(result.revisionId).toBe(sampleRecord.revision.id);
      expect(result.fileId).toBe(sampleRecord.files[0].id);
      expect(result.revisionNumber).toBe(1);
      expect(result.storageUploaded).toBe(true);
    });

    it('handles idempotent rerun when master template is already ingested', async () => {
      mockStorageService.objectExists.mockResolvedValue(true); // Object already in storage

      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          status: 'ALREADY_INGESTED',
          asset_id: sampleRecord.asset.id,
          revision_id: sampleRecord.revision.id,
          file_id: sampleRecord.files[0].id,
          revision_number: 1,
          slug: sampleRecord.asset.slug,
          storage_key: sampleRecord.files[0].storageKey,
          message: 'Master template "coaching-post-1" already ingested with matching content checksum.',
        },
        error: null,
      });

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      const actorId = '99999999-8888-7777-6666-555555555555';
      const result = await service.ingestTemplate(sampleRecord, actorId, { dryRun: false });

      expect(result.status).toBe('ALREADY_INGESTED');
      expect(mockStorageService.uploadObject).not.toHaveBeenCalled(); // Skipped redundant re-upload
      expect(result.storageUploaded).toBe(false);
    });

    it('rejects with ForbiddenError when actor is not an active ADMIN', async () => {
      mockStorageService.objectExists.mockResolvedValue(true);
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Access denied: Ingestion actor 99999999-8888-7777-6666-555555555555 does not have ADMIN role',
        },
      });

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      await expect(
        service.ingestTemplate(sampleRecord, '99999999-8888-7777-6666-555555555555', { dryRun: false })
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects with ConflictError when asset collision occurs', async () => {
      mockStorageService.objectExists.mockResolvedValue(true);
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Asset collision: An asset already exists with matching id, slug, or legacy_id but differing attributes',
        },
      });

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      await expect(
        service.ingestTemplate(sampleRecord, '99999999-8888-7777-6666-555555555555', { dryRun: false })
      ).rejects.toThrow(ConflictError);
    });

    it('executes in dry-run mode with zero network calls to Storage and zero DB RPC calls', async () => {
      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      const result = await service.ingestTemplate(sampleRecord, 'admin-id', { dryRun: true });

      expect(result.status).toBe('WOULD_INGEST');
      expect(result.dryRun).toBe(true);
      expect(mockStorageService.uploadObject).not.toHaveBeenCalled();
      expect(mockStorageService.objectExists).not.toHaveBeenCalled();
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // TASK 27 — STORAGE ORCHESTRATION & COMPENSATION TESTS
  // ===========================================================================
  describe('Storage Orchestration & Non-Transactional Compensation', () => {
    it('does NOT call DB RPC if storage upload fails', async () => {
      mockStorageService.objectExists.mockResolvedValue(false);
      mockStorageService.uploadObject.mockRejectedValue(new Error('Storage upload failed: network timeout'));

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      await expect(
        service.ingestTemplate(sampleRecord, 'admin-id', { dryRun: false })
      ).rejects.toThrow(/Storage upload failed/i);

      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled(); // DB RPC NOT called
      expect(mockStorageService.deleteObject).not.toHaveBeenCalled(); // No compensation needed
    });

    it('triggers storage compensation (deleteObject) if DB RPC fails after successful upload', async () => {
      mockStorageService.objectExists.mockResolvedValue(false); // Newly uploaded
      mockStorageService.uploadObject.mockResolvedValue({ success: true });
      mockStorageService.deleteObject.mockResolvedValue(undefined);

      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      });

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      await expect(
        service.ingestTemplate(sampleRecord, 'admin-id', { dryRun: false })
      ).rejects.toThrow(ConflictError);

      // Verify immediate compensation was invoked
      expect(mockStorageService.deleteObject).toHaveBeenCalledTimes(1);
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith(
        'sBLOOM_templateshub',
        sampleRecord.files[0].storageKey
      );
    });

    it('enqueues deletion job into storage_deletion_jobs_templatedhub if immediate deletion fails', async () => {
      mockStorageService.objectExists.mockResolvedValue(false);
      mockStorageService.uploadObject.mockResolvedValue({ success: true });
      mockStorageService.deleteObject.mockRejectedValue(new Error('Storage delete 500 error'));

      const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.from.mockReturnValue({ insert: mockInsert });

      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Database failure during ingestion',
        },
      });

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      await expect(
        service.ingestTemplate(sampleRecord, 'admin-id', { dryRun: false })
      ).rejects.toThrow(AppError);

      // Verify deletion job was enqueued into the outbox table
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('storage_deletion_jobs_templatedhub');
      expect(mockInsert).toHaveBeenCalledWith({
        storage_key: sampleRecord.files[0].storageKey,
        bucket_name: 'sBLOOM_templateshub',
        status: 'PENDING',
        attempts: 0,
      });
    });

    it('does NOT delete storage object on DB failure if object was already existing prior to run', async () => {
      mockStorageService.objectExists.mockResolvedValue(true); // Pre-existing object

      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Asset collision: An asset already exists',
        },
      });

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      await expect(
        service.ingestTemplate(sampleRecord, 'admin-id', { dryRun: false })
      ).rejects.toThrow(ConflictError);

      // Compensation MUST NOT delete pre-existing objects that this run did not upload
      expect(mockStorageService.deleteObject).not.toHaveBeenCalled();
    });

    it('ingestBatch aggregates success, skip, and error counts cleanly', async () => {
      mockStorageService.objectExists.mockResolvedValue(false);
      mockStorageService.uploadObject.mockResolvedValue({ success: true });

      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          status: 'CREATED',
          asset_id: sampleRecord.asset.id,
          revision_id: sampleRecord.revision.id,
          file_id: sampleRecord.files[0].id,
          revision_number: 1,
          slug: sampleRecord.asset.slug,
          storage_key: sampleRecord.files[0].storageKey,
        },
        error: null,
      });

      const service = new MasterTemplateIngestionService({
        storageService: mockStorageService,
        supabaseClient: mockSupabaseClient,
      });

      const batchResult = await service.ingestBatch([sampleRecord], 'admin-id', { dryRun: false });

      expect(batchResult.total).toBe(1);
      expect(batchResult.createdCount).toBe(1);
      expect(batchResult.alreadyIngestedCount).toBe(0);
      expect(batchResult.failedCount).toBe(0);
      expect(batchResult.results.length).toBe(1);
    });
  });
});
