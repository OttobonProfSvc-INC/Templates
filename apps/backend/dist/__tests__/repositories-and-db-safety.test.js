"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const user_repository_1 = require("../modules/users/user.repository");
const template_repository_1 = require("../modules/templates/template.repository");
const customization_repository_1 = require("../modules/customizations/customization.repository");
const review_repository_1 = require("../modules/reviews/review.repository");
const asset_repository_1 = require("../modules/assets/asset.repository");
const errors_1 = require("../common/errors");
describe('Phase 4I-2 & 4I-21: Repositories & Database Safety Gate Tests', () => {
    // =========================================================================
    // 4I-2: DB Safety Gate Tests
    // =========================================================================
    describe('Test Harness Safety Gate (4I-2)', () => {
        it('verifies test environment never implicitly connects to shared Supabase for write operations', () => {
            // In the absence of an explicit TEST_DATABASE_URL, test database writes MUST be blocked
            const testDbUrl = process.env.TEST_DATABASE_URL;
            const isConfiguredIsolated = testDbUrl &&
                testDbUrl.trim().length > 0 &&
                testDbUrl !== process.env.DATABASE_URL &&
                testDbUrl !== process.env.DIRECT_URL;
            // Ensure that in default test execution, no test accidentally executes against shared Supabase
            if (!isConfiguredIsolated) {
                expect(process.env.TEST_DATABASE_URL).toBeUndefined();
            }
        });
    });
    // =========================================================================
    // 4I-21: Repository Client Propagation & Stored Routine Wrappers
    // =========================================================================
    describe('Repository Boundaries & Client Forwarding (4I-21)', () => {
        let mockDefaultClient;
        let mockTxClient;
        const createMockChain = () => {
            const chain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                not: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
            // When chain is awaited as a promise (e.g. from.select() without maybeSingle)
            chain.then = (resolve) => resolve({ data: [], error: null });
            return chain;
        };
        beforeEach(() => {
            const defaultChain = createMockChain();
            const txChain = createMockChain();
            mockDefaultClient = {
                user: { findUnique: jest.fn() },
                asset: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
                assetRevision: { findUnique: jest.fn(), findMany: jest.fn() },
                assetUsage: { create: jest.fn() },
                review: { findMany: jest.fn() },
                $queryRaw: jest.fn(),
                from: jest.fn().mockReturnValue(defaultChain),
                rpc: jest.fn(),
                _chain: defaultChain,
            };
            mockTxClient = {
                user: { findUnique: jest.fn() },
                asset: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
                assetRevision: { findUnique: jest.fn(), findMany: jest.fn() },
                assetUsage: { create: jest.fn() },
                review: { findMany: jest.fn() },
                $queryRaw: jest.fn(),
                from: jest.fn().mockReturnValue(txChain),
                rpc: jest.fn(),
                _chain: txChain,
            };
        });
        describe('1. UserRepository', () => {
            it('uses provided tx client when supplied, default client otherwise', async () => {
                const repo = new user_repository_1.UserRepository(mockDefaultClient);
                const validUserId = '11111111-2222-3333-4444-555555555555';
                // Without tx: uses default PostgREST client
                mockDefaultClient._chain.maybeSingle.mockResolvedValue({
                    data: { id: validUserId, role: 'CONTRIBUTOR', is_active: true },
                    error: null,
                });
                await repo.findAuthUserById(validUserId);
                expect(mockDefaultClient.from).toHaveBeenCalledWith('users_templatedhub');
                expect(mockTxClient.from).not.toHaveBeenCalled();
                // With tx: uses tx PostgREST client
                mockTxClient._chain.maybeSingle.mockResolvedValue({
                    data: { id: validUserId, role: 'CONTRIBUTOR', is_active: true },
                    error: null,
                });
                await repo.findAuthUserById(validUserId, mockTxClient);
                expect(mockTxClient.from).toHaveBeenCalledWith('users_templatedhub');
            });
        });
        describe('2. TemplateRepository', () => {
            it('uses provided tx client when supplied, default client otherwise', async () => {
                const repo = new template_repository_1.TemplateRepository(mockDefaultClient);
                // Without tx: uses default PostgREST client
                mockDefaultClient._chain.then = (resolve) => resolve({ data: [], error: null });
                await repo.findPublishedTemplates();
                expect(mockDefaultClient.from).toHaveBeenCalledWith('assets_templatedhub');
                expect(mockTxClient.from).not.toHaveBeenCalled();
                // With tx: uses tx PostgREST client
                mockTxClient._chain.then = (resolve) => resolve({ data: [], error: null });
                await repo.findPublishedTemplates(mockTxClient);
                expect(mockTxClient.from).toHaveBeenCalledWith('assets_templatedhub');
            });
        });
        describe('3. CustomizationRepository', () => {
            it('allocateNextRevision calls public.allocate_next_revision routine and maps errors', async () => {
                const repo = new customization_repository_1.CustomizationRepository(mockDefaultClient);
                // Success case with tx
                mockTxClient.rpc.mockResolvedValue({
                    data: {
                        revision_id: 'rev-alloc-1',
                        revision_number: 1,
                        status: 'DRAFT',
                    },
                    error: null,
                });
                const res = await repo.allocateNextRevision({
                    assetId: '11111111-2222-3333-4444-555555555555',
                    title: 'My Title',
                    metadata: {},
                    createdById: '22222222-3333-4444-5555-666666666666',
                }, mockTxClient);
                expect(res.revisionId).toBe('rev-alloc-1');
                expect(res.revisionNumber).toBe(1);
                expect(mockTxClient.rpc).toHaveBeenCalledWith('allocate_next_revision', expect.objectContaining({
                    p_asset_id: '11111111-2222-3333-4444-555555555555',
                    p_title: 'My Title',
                }));
                expect(mockDefaultClient.rpc).not.toHaveBeenCalled();
                // Error mapping case
                mockTxClient.rpc.mockResolvedValue({
                    data: null,
                    error: {
                        message: 'duplicate key value violates unique constraint',
                        code: '23505',
                    },
                });
                await expect(repo.allocateNextRevision({ assetId: '11111111-2222-3333-4444-555555555555', title: 'T', metadata: {} }, mockTxClient)).rejects.toThrow(errors_1.ConflictError);
            });
        });
        describe('4. ReviewRepository', () => {
            it('submitDraftRevision calls public.submit_draft_revision via Supabase RPC and maps lifecycle rejections', async () => {
                mockDefaultClient.rpc = jest.fn().mockResolvedValue({
                    data: { revision_id: 'r-1', status: 'SUBMITTED' },
                    error: null,
                });
                const repo = new review_repository_1.ReviewRepository(mockDefaultClient);
                const res = await repo.submitDraftRevision('r-1');
                expect(res.status).toBe('SUBMITTED');
                expect(mockDefaultClient.rpc).toHaveBeenCalledWith('submit_draft_revision', {
                    p_revision_id: 'r-1',
                });
                expect(mockDefaultClient.$queryRaw).not.toHaveBeenCalled();
                // Error mapping test: status not draft
                mockDefaultClient.rpc.mockResolvedValue({
                    data: null,
                    error: { code: 'P0001', message: 'Cannot submit revision r-1; current status is SUBMITTED (must be DRAFT)' },
                });
                await expect(repo.submitDraftRevision('r-1')).rejects.toThrow(errors_1.ConflictError);
            });
            it('recordDecision calls public.record_review_decision via Supabase RPC and maps peer-review violations', async () => {
                mockDefaultClient.rpc = jest.fn().mockResolvedValue({
                    data: { review_id: 'rw-1', revision_id: 'r-1', asset_id: 'a-1', status: 'APPROVED', decision: 'APPROVED' },
                    error: null,
                });
                const repo = new review_repository_1.ReviewRepository(mockDefaultClient);
                const res = await repo.recordDecision({
                    revisionId: 'r-1',
                    reviewerId: 'adm-1',
                    decision: 'APPROVED',
                    comments: 'Nice',
                });
                expect(res.decision).toBe('APPROVED');
                expect(mockDefaultClient.rpc).toHaveBeenCalledWith('record_review_decision', {
                    p_revision_id: 'r-1',
                    p_reviewer_id: 'adm-1',
                    p_decision: 'APPROVED',
                    p_comments: 'Nice',
                });
                expect(mockDefaultClient.$queryRaw).not.toHaveBeenCalled();
                // Error mapping test: peer review violation from DB routine
                mockDefaultClient.rpc.mockResolvedValue({
                    data: null,
                    error: { code: 'P0001', message: 'Peer-review integrity violation: Author cannot review or decide their own revision r-1' },
                });
                await expect(repo.recordDecision({
                    revisionId: 'r-1',
                    reviewerId: 'adm-1',
                    decision: 'APPROVED',
                    comments: 'Self',
                })).rejects.toThrow(errors_1.ForbiddenError);
            });
        });
        describe('5. AssetRepository', () => {
            it('publishRevision calls public.publish_asset_revision via Supabase RPC and maps approval rejections', async () => {
                mockTxClient.rpc.mockResolvedValue({
                    data: { asset_id: 'a-1', published_revision_id: 'r-2', superseded_revision_id: 'r-1' },
                    error: null,
                });
                const repo = new asset_repository_1.AssetRepository(mockDefaultClient);
                const res = await repo.publishRevision({ assetId: 'a-1', revisionId: 'r-2' }, mockTxClient);
                expect(res.publishedRevisionId).toBe('r-2');
                expect(res.supersededRevisionId).toBe('r-1');
                expect(mockTxClient.rpc).toHaveBeenCalledWith('publish_asset_revision', {
                    p_asset_id: 'a-1',
                    p_revision_id: 'r-2',
                });
                expect(mockTxClient.$queryRaw).not.toHaveBeenCalled();
                // Error mapping test: not approved
                mockTxClient.rpc.mockResolvedValue({
                    data: null,
                    error: { code: 'P0001', message: 'Cannot publish revision r-2 in status DRAFT (must be APPROVED)' },
                });
                await expect(repo.publishRevision({ assetId: 'a-1', revisionId: 'r-2' }, mockTxClient)).rejects.toThrow(errors_1.ConflictError);
            });
            it('archiveAsset calls public.archive_asset via Supabase RPC and maps already archived conflicts', async () => {
                mockTxClient.rpc.mockResolvedValue({
                    data: { asset_id: 'a-1', status: 'ARCHIVED', previous_status: 'PUBLISHED' },
                    error: null,
                });
                const repo = new asset_repository_1.AssetRepository(mockDefaultClient);
                const res = await repo.archiveAsset({ assetId: 'a-1', actorId: 'adm-1' }, mockTxClient);
                expect(res.status).toBe('ARCHIVED');
                expect(mockTxClient.rpc).toHaveBeenCalledWith('archive_asset', {
                    p_asset_id: 'a-1',
                    p_actor_id: 'adm-1',
                });
                expect(mockTxClient.$queryRaw).not.toHaveBeenCalled();
                mockTxClient.rpc.mockResolvedValue({
                    data: null,
                    error: { code: 'P0001', message: 'Asset a-1 is already archived' },
                });
                await expect(repo.archiveAsset({ assetId: 'a-1', actorId: 'adm-1' }, mockTxClient)).rejects.toThrow(errors_1.ConflictError);
            });
            it('unarchiveAsset calls public.unarchive_asset via Supabase RPC and maps not archived conflicts', async () => {
                mockTxClient.rpc.mockResolvedValue({
                    data: { asset_id: 'a-1', status: 'DRAFT', previous_status: 'ARCHIVED' },
                    error: null,
                });
                const repo = new asset_repository_1.AssetRepository(mockDefaultClient);
                const res = await repo.unarchiveAsset({ assetId: 'a-1', actorId: 'adm-1' }, mockTxClient);
                expect(res.status).toBe('DRAFT');
                expect(mockTxClient.rpc).toHaveBeenCalledWith('unarchive_asset', {
                    p_asset_id: 'a-1',
                    p_actor_id: 'adm-1',
                });
                expect(mockTxClient.$queryRaw).not.toHaveBeenCalled();
                mockTxClient.rpc.mockResolvedValue({
                    data: null,
                    error: { code: 'P0001', message: 'Asset a-1 is not archived (current status: DRAFT)' },
                });
                await expect(repo.unarchiveAsset({ assetId: 'a-1', actorId: 'adm-1' }, mockTxClient)).rejects.toThrow(errors_1.ConflictError);
            });
            it('deleteDraftRevision calls public.delete_draft_revision via Supabase RPC and maps access denied errors', async () => {
                mockTxClient.rpc.mockResolvedValue({
                    data: {
                        revision_id: 'r-1',
                        asset_id: 'a-1',
                        revision_number: 1,
                        deleted_file_count: 0,
                        status: 'DELETED',
                    },
                    error: null,
                });
                const repo = new asset_repository_1.AssetRepository(mockDefaultClient);
                const res = await repo.deleteDraftRevision({ revisionId: 'r-1', actorId: 'u-1' }, mockTxClient);
                expect(res.status).toBe('DELETED');
                expect(mockTxClient.rpc).toHaveBeenCalledWith('delete_draft_revision', {
                    p_revision_id: 'r-1',
                    p_actor_id: 'u-1',
                });
                expect(mockTxClient.$queryRaw).not.toHaveBeenCalled();
                mockTxClient.rpc.mockResolvedValue({
                    data: null,
                    error: { code: 'P0001', message: 'Access denied: User u-1 is neither the author nor an administrator' },
                });
                await expect(repo.deleteDraftRevision({ revisionId: 'r-1', actorId: 'u-1' }, mockTxClient)).rejects.toThrow(errors_1.ForbiddenError);
            });
        });
    });
});
