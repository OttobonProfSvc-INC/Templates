"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const asset_repository_1 = require("../modules/assets/asset.repository");
const asset_lifecycle_service_1 = require("../modules/assets/asset-lifecycle.service");
const errors_1 = require("../common/errors");
const client_1 = require("../infrastructure/supabase/client");
jest.mock('../infrastructure/supabase/client', () => {
    const mockGlobalSupabase = {
        from: jest.fn(),
        rpc: jest.fn(),
    };
    return {
        getSupabaseServerClient: jest.fn(() => mockGlobalSupabase),
        resetSupabaseServerClient: jest.fn(),
    };
});
describe('API-4: Asset Lifecycle RPC Migration to Supabase', () => {
    let mockGlobalSupabase;
    let mockInjectedClient;
    beforeEach(() => {
        jest.clearAllMocks();
        mockGlobalSupabase = (0, client_1.getSupabaseServerClient)();
        mockInjectedClient = {
            from: jest.fn(),
            rpc: jest.fn(),
            $queryRaw: jest.fn(),
        };
    });
    // =========================================================================
    // TASK 15 — TEST publishRevision RPC
    // =========================================================================
    describe('Task 15 — publishRevision RPC', () => {
        it('1. Calls exact RPC function name publish_asset_revision with exact payload', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    published_revision_id: 'rev-2',
                    superseded_revision_id: 'rev-1',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await repo.publishRevision({ assetId: 'asset-1', revisionId: 'rev-2' });
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('publish_asset_revision', {
                p_asset_id: 'asset-1',
                p_revision_id: 'rev-2',
            });
        });
        it('2. Maps domain result correctly with supersededRevisionId UUID', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    published_revision_id: 'rev-2',
                    superseded_revision_id: 'rev-1',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            const res = await repo.publishRevision({ assetId: 'asset-1', revisionId: 'rev-2' });
            expect(res).toEqual({
                assetId: 'asset-1',
                publishedRevisionId: 'rev-2',
                supersededRevisionId: 'rev-1',
            });
        });
        it('3. Preserves nullable supersededRevisionId as null when no prior revision existed', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-first',
                    published_revision_id: 'rev-1',
                    superseded_revision_id: null,
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            const res = await repo.publishRevision({ assetId: 'asset-first', revisionId: 'rev-1' });
            expect(res).toEqual({
                assetId: 'asset-first',
                publishedRevisionId: 'rev-1',
                supersededRevisionId: null,
            });
        });
        it('4. Handles array response from PostgREST safely', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: [
                    {
                        asset_id: 'asset-arr',
                        published_revision_id: 'rev-arr',
                        superseded_revision_id: null,
                    },
                ],
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            const res = await repo.publishRevision({ assetId: 'asset-arr', revisionId: 'rev-arr' });
            expect(res).toEqual({
                assetId: 'asset-arr',
                publishedRevisionId: 'rev-arr',
                supersededRevisionId: null,
            });
        });
        it('5. Uses supplied client and does NOT execute Prisma $queryRaw', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    published_revision_id: 'rev-1',
                    superseded_revision_id: null,
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await repo.publishRevision({ assetId: 'asset-1', revisionId: 'rev-1' });
            expect(mockInjectedClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockInjectedClient.$queryRaw).not.toHaveBeenCalled();
            expect(mockGlobalSupabase.rpc).not.toHaveBeenCalled();
        });
        it('6. Uses clientOverride when passed as second argument', async () => {
            const overrideClient = { rpc: jest.fn().mockResolvedValue({
                    data: {
                        asset_id: 'asset-override',
                        published_revision_id: 'rev-override',
                        superseded_revision_id: null,
                    },
                    error: null,
                }) };
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            const res = await repo.publishRevision({ assetId: 'asset-override', revisionId: 'rev-override' }, overrideClient);
            expect(overrideClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockInjectedClient.rpc).not.toHaveBeenCalled();
            expect(res.assetId).toBe('asset-override');
        });
        it('7. Rejects execution context without rpc with InternalError', async () => {
            const invalidClient = { query: jest.fn() };
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.publishRevision({ assetId: 'a-1', revisionId: 'r-1' }, invalidClient)).rejects.toThrow(errors_1.InternalError);
        });
        it('8. Maps lifecycle error (revision not APPROVED) to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Cannot publish revision rev-1 in status DRAFT (must be APPROVED)',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.publishRevision({ assetId: 'asset-1', revisionId: 'rev-1' })).rejects.toThrow(errors_1.ConflictError);
        });
        it('9. Maps non-existent asset to NotFoundError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Asset asset-missing does not exist',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.publishRevision({ assetId: 'asset-missing', revisionId: 'rev-1' })).rejects.toThrow(errors_1.NotFoundError);
        });
        it('10. Maps revision not belonging to asset to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Revision rev-wrong does not belong to asset asset-1',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.publishRevision({ assetId: 'asset-1', revisionId: 'rev-wrong' })).rejects.toThrow(errors_1.ConflictError);
        });
        it('11. Fails safely on null data with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.publishRevision({ assetId: 'asset-1', revisionId: 'rev-1' })).rejects.toThrow(errors_1.InternalError);
        });
        it('12. Fails safely on missing required properties with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { asset_id: 'asset-1' }, // missing published_revision_id
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.publishRevision({ assetId: 'asset-1', revisionId: 'rev-1' })).rejects.toThrow(errors_1.InternalError);
        });
    });
    // =========================================================================
    // TASK 16 — TEST archiveAsset RPC
    // =========================================================================
    describe('Task 16 — archiveAsset RPC', () => {
        it('1. Calls exact RPC function name archive_asset with exact parameters', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    status: 'ARCHIVED',
                    previous_status: 'PUBLISHED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await repo.archiveAsset({ assetId: 'asset-1', actorId: 'admin-1' });
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('archive_asset', {
                p_asset_id: 'asset-1',
                p_actor_id: 'admin-1',
            });
        });
        it('2. Maps response correctly preserving status and previousStatus', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    status: 'ARCHIVED',
                    previous_status: 'DRAFT',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            const res = await repo.archiveAsset({ assetId: 'asset-1', actorId: 'admin-1' });
            expect(res).toEqual({
                assetId: 'asset-1',
                status: 'ARCHIVED',
                previousStatus: 'DRAFT',
            });
        });
        it('3. Maps already-archived conflict to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Asset asset-1 is already archived',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.archiveAsset({ assetId: 'asset-1', actorId: 'admin-1' })).rejects.toThrow(errors_1.ConflictError);
        });
        it('4. Maps missing asset to NotFoundError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Asset asset-999 does not exist',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.archiveAsset({ assetId: 'asset-999', actorId: 'admin-1' })).rejects.toThrow(errors_1.NotFoundError);
        });
        it('5. Maps non-admin access denial to ForbiddenError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Access denied: Actor user-contrib is not an active administrator',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.archiveAsset({ assetId: 'asset-1', actorId: 'user-contrib' })).rejects.toThrow(errors_1.ForbiddenError);
        });
        it('6. Uses supplied client and does NOT call Prisma $queryRaw', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    status: 'ARCHIVED',
                    previous_status: 'PUBLISHED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await repo.archiveAsset({ assetId: 'asset-1', actorId: 'admin-1' });
            expect(mockInjectedClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockInjectedClient.$queryRaw).not.toHaveBeenCalled();
        });
        it('7. Fails safely on malformed/null response with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: 'malformed_string',
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.archiveAsset({ assetId: 'asset-1', actorId: 'admin-1' })).rejects.toThrow(errors_1.InternalError);
        });
    });
    // =========================================================================
    // TASK 17 — TEST unarchiveAsset RPC
    // =========================================================================
    describe('Task 17 — unarchiveAsset RPC', () => {
        it('1. Calls exact RPC function name unarchive_asset with exact parameters', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    status: 'DRAFT',
                    previous_status: 'ARCHIVED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await repo.unarchiveAsset({ assetId: 'asset-1', actorId: 'admin-1' });
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('unarchive_asset', {
                p_asset_id: 'asset-1',
                p_actor_id: 'admin-1',
            });
        });
        it('2. Maps response correctly preserving status and previousStatus', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    status: 'DRAFT',
                    previous_status: 'ARCHIVED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            const res = await repo.unarchiveAsset({ assetId: 'asset-1', actorId: 'admin-1' });
            expect(res).toEqual({
                assetId: 'asset-1',
                status: 'DRAFT',
                previousStatus: 'ARCHIVED',
            });
        });
        it('3. Maps not-archived state to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Asset asset-1 is not archived (current status: PUBLISHED)',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.unarchiveAsset({ assetId: 'asset-1', actorId: 'admin-1' })).rejects.toThrow(errors_1.ConflictError);
        });
        it('4. Maps missing asset to NotFoundError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Asset asset-none does not exist',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.unarchiveAsset({ assetId: 'asset-none', actorId: 'admin-1' })).rejects.toThrow(errors_1.NotFoundError);
        });
        it('5. Maps non-admin access denial to ForbiddenError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Access denied: Actor user-contrib is not an active administrator',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.unarchiveAsset({ assetId: 'asset-1', actorId: 'user-contrib' })).rejects.toThrow(errors_1.ForbiddenError);
        });
        it('6. Uses supplied client and does NOT call Prisma $queryRaw', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    asset_id: 'asset-1',
                    status: 'DRAFT',
                    previous_status: 'ARCHIVED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await repo.unarchiveAsset({ assetId: 'asset-1', actorId: 'admin-1' });
            expect(mockInjectedClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockInjectedClient.$queryRaw).not.toHaveBeenCalled();
        });
        it('7. Fails safely on missing required fields with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { asset_id: 'asset-1', status: 'DRAFT' }, // missing previous_status
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.unarchiveAsset({ assetId: 'asset-1', actorId: 'admin-1' })).rejects.toThrow(errors_1.InternalError);
        });
    });
    // =========================================================================
    // TASK 18 — TEST deleteDraftRevision RPC
    // =========================================================================
    describe('Task 18 — deleteDraftRevision RPC', () => {
        it('1. Calls exact RPC function name delete_draft_revision with exact parameters', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    revision_id: 'rev-draft-1',
                    asset_id: 'asset-1',
                    revision_number: 2,
                    deleted_file_count: 3,
                    status: 'DELETED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await repo.deleteDraftRevision({ revisionId: 'rev-draft-1', actorId: 'author-1' });
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('delete_draft_revision', {
                p_revision_id: 'rev-draft-1',
                p_actor_id: 'author-1',
            });
        });
        it('2. Maps domain result correctly with strict integer typing for numeric fields', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    revision_id: 'rev-draft-1',
                    asset_id: 'asset-1',
                    revision_number: 4,
                    deleted_file_count: 0,
                    status: 'DELETED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            const res = await repo.deleteDraftRevision({ revisionId: 'rev-draft-1', actorId: 'author-1' });
            expect(res).toEqual({
                revisionId: 'rev-draft-1',
                assetId: 'asset-1',
                revisionNumber: 4,
                deletedFileCount: 0,
                status: 'DELETED',
            });
            expect(typeof res.revisionNumber).toBe('number');
            expect(typeof res.deletedFileCount).toBe('number');
        });
        it('3. Maps deleting non-DRAFT revision to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Cannot delete AssetRevision rev-1 in status SUBMITTED; only unsubmitted DRAFT revisions may be deleted',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.deleteDraftRevision({ revisionId: 'rev-1', actorId: 'author-1' })).rejects.toThrow(errors_1.ConflictError);
        });
        it('4. Maps missing revision to NotFoundError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'AssetRevision rev-none does not exist',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.deleteDraftRevision({ revisionId: 'rev-none', actorId: 'author-1' })).rejects.toThrow(errors_1.NotFoundError);
        });
        it('5. Maps neither author nor administrator to ForbiddenError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Access denied: User user-other is neither the author nor an administrator',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.deleteDraftRevision({ revisionId: 'rev-1', actorId: 'user-other' })).rejects.toThrow(errors_1.ForbiddenError);
        });
        it('6. Maps deleting current_published_revision reference to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Integrity violation: Cannot delete revision rev-pub referenced as current_published_revision',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.deleteDraftRevision({ revisionId: 'rev-pub', actorId: 'author-1' })).rejects.toThrow(errors_1.ConflictError);
        });
        it('7. Rejects string-coerced revisionNumber with InternalError (strict integer invariant)', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    revision_id: 'rev-1',
                    asset_id: 'a-1',
                    revision_number: '2', // String, NOT number
                    deleted_file_count: 0,
                    status: 'DELETED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.deleteDraftRevision({ revisionId: 'rev-1', actorId: 'author-1' })).rejects.toThrow(errors_1.InternalError);
        });
        it('8. Rejects non-integer float revisionNumber with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    revision_id: 'rev-1',
                    asset_id: 'a-1',
                    revision_number: 2.5, // Float, NOT integer
                    deleted_file_count: 0,
                    status: 'DELETED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.deleteDraftRevision({ revisionId: 'rev-1', actorId: 'author-1' })).rejects.toThrow(errors_1.InternalError);
        });
        it('9. Rejects string-coerced deletedFileCount with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    revision_id: 'rev-1',
                    asset_id: 'a-1',
                    revision_number: 2,
                    deleted_file_count: '5', // String
                    status: 'DELETED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await expect(repo.deleteDraftRevision({ revisionId: 'rev-1', actorId: 'author-1' })).rejects.toThrow(errors_1.InternalError);
        });
        it('10. Uses supplied client and does NOT call Prisma $queryRaw', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    revision_id: 'rev-1',
                    asset_id: 'a-1',
                    revision_number: 1,
                    deleted_file_count: 0,
                    status: 'DELETED',
                },
                error: null,
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            await repo.deleteDraftRevision({ revisionId: 'rev-1', actorId: 'author-1' });
            expect(mockInjectedClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockInjectedClient.$queryRaw).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // TASK 7 & 19 — Service Contract & Authorization Regression Tests
    // =========================================================================
    describe('Tasks 7 & 19 — AssetLifecycleService Authorization & Contracts', () => {
        it('1. publishRevision rejects CONTRIBUTOR and permits ADMIN', async () => {
            const mockRepo = {
                publishRevision: jest.fn().mockResolvedValue({
                    assetId: 'a-1',
                    publishedRevisionId: 'r-1',
                    supersededRevisionId: null,
                }),
            };
            const service = new asset_lifecycle_service_1.AssetLifecycleService(mockRepo);
            await expect(service.publishRevision({ assetId: 'a-1', revisionId: 'r-1' }, { id: 'u-1', role: 'CONTRIBUTOR' })).rejects.toThrow(errors_1.ForbiddenError);
            const res = await service.publishRevision({ assetId: 'a-1', revisionId: 'r-1' }, { id: 'admin-1', role: 'ADMIN' });
            expect(res.publishedRevisionId).toBe('r-1');
            expect(mockRepo.publishRevision).toHaveBeenCalledWith({ assetId: 'a-1', revisionId: 'r-1' });
        });
        it('2. archiveAsset rejects CONTRIBUTOR and permits ADMIN', async () => {
            const mockRepo = {
                archiveAsset: jest.fn().mockResolvedValue({
                    assetId: 'a-1',
                    status: 'ARCHIVED',
                    previousStatus: 'PUBLISHED',
                }),
            };
            const service = new asset_lifecycle_service_1.AssetLifecycleService(mockRepo);
            await expect(service.archiveAsset('a-1', { id: 'u-1', role: 'CONTRIBUTOR' })).rejects.toThrow(errors_1.ForbiddenError);
            const res = await service.archiveAsset('a-1', { id: 'admin-1', role: 'ADMIN' });
            expect(res.status).toBe('ARCHIVED');
            expect(mockRepo.archiveAsset).toHaveBeenCalledWith({ assetId: 'a-1', actorId: 'admin-1' });
        });
        it('3. unarchiveAsset rejects CONTRIBUTOR and permits ADMIN', async () => {
            const mockRepo = {
                unarchiveAsset: jest.fn().mockResolvedValue({
                    assetId: 'a-1',
                    status: 'DRAFT',
                    previousStatus: 'ARCHIVED',
                }),
            };
            const service = new asset_lifecycle_service_1.AssetLifecycleService(mockRepo);
            await expect(service.unarchiveAsset('a-1', { id: 'u-1', role: 'CONTRIBUTOR' })).rejects.toThrow(errors_1.ForbiddenError);
            const res = await service.unarchiveAsset('a-1', { id: 'admin-1', role: 'ADMIN' });
            expect(res.status).toBe('DRAFT');
            expect(mockRepo.unarchiveAsset).toHaveBeenCalledWith({ assetId: 'a-1', actorId: 'admin-1' });
        });
        it('4. deleteDraftRevision validates role and passes actorId to repository gateway', async () => {
            const mockRepo = {
                deleteDraftRevision: jest.fn().mockResolvedValue({
                    revisionId: 'r-1',
                    assetId: 'a-1',
                    revisionNumber: 1,
                    deletedFileCount: 0,
                    status: 'DELETED',
                }),
            };
            const service = new asset_lifecycle_service_1.AssetLifecycleService(mockRepo);
            await expect(service.deleteDraftRevision('r-1', { id: 'u-1', role: 'INVALID_ROLE' })).rejects.toThrow(errors_1.ForbiddenError);
            const res = await service.deleteDraftRevision('r-1', {
                id: 'contrib-1',
                role: 'CONTRIBUTOR',
            });
            expect(res.status).toBe('DELETED');
            expect(mockRepo.deleteDraftRevision).toHaveBeenCalledWith({
                revisionId: 'r-1',
                actorId: 'contrib-1',
            });
        });
    });
    // =========================================================================
    // TASK 11 — Error Sanitization
    // =========================================================================
    describe('Task 11 — Error Sanitization', () => {
        it('never leaks secret keys, database URLs, or authorization headers', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Connection failed at postgresql://postgres:SUPER_SECRET_PASSWORD@db.sbloom.supabase.co:5432 with key eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.unauthorized',
                },
            });
            const repo = new asset_repository_1.AssetRepository(mockInjectedClient);
            try {
                await repo.publishRevision({ assetId: 'a-1', revisionId: 'r-1' });
                expect(true).toBe(false); // Should not reach here
            }
            catch (err) {
                expect(err.message).not.toContain('SUPER_SECRET_PASSWORD');
                expect(err.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
                expect(err.message).not.toContain('postgresql://');
            }
        });
    });
});
