"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const review_repository_1 = require("../modules/reviews/review.repository");
const review_workflow_service_1 = require("../modules/reviews/review-workflow.service");
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
describe('API-3: Review Workflow RPC Migration to Supabase', () => {
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
    // TASK 12 — TEST submitDraftRevision RPC
    // =========================================================================
    describe('Task 12 — submitDraftRevision RPC', () => {
        it('1. Calls exact RPC function name submit_draft_revision with correct payload', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { revision_id: 'rev-uuid-1', status: 'SUBMITTED' },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await repo.submitDraftRevision('rev-uuid-1');
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('submit_draft_revision', {
                p_revision_id: 'rev-uuid-1',
            });
        });
        it('2. Successfully maps response payload to domain result { revisionId, status }', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { revision_id: 'rev-uuid-1', status: 'SUBMITTED' },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const result = await repo.submitDraftRevision('rev-uuid-1');
            expect(result).toEqual({
                revisionId: 'rev-uuid-1',
                status: 'SUBMITTED',
            });
        });
        it('3. Handles array response format from PostgREST safely', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: [{ revision_id: 'rev-uuid-array', status: 'SUBMITTED' }],
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const result = await repo.submitDraftRevision('rev-uuid-array');
            expect(result).toEqual({
                revisionId: 'rev-uuid-array',
                status: 'SUBMITTED',
            });
        });
        it('4. Uses supplied client and does NOT execute any Prisma $queryRaw', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { revision_id: 'rev-1', status: 'SUBMITTED' },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await repo.submitDraftRevision('rev-1');
            expect(mockInjectedClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockInjectedClient.$queryRaw).not.toHaveBeenCalled();
            expect(mockGlobalSupabase.rpc).not.toHaveBeenCalled();
        });
        it('5. Uses injected Supabase client when supplied (Case B)', async () => {
            mockGlobalSupabase.rpc.mockResolvedValue({
                data: { revision_id: 'rev-global', status: 'SUBMITTED' },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockGlobalSupabase);
            const result = await repo.submitDraftRevision('rev-global');
            expect(mockGlobalSupabase.rpc).toHaveBeenCalledWith('submit_draft_revision', {
                p_revision_id: 'rev-global',
            });
            expect(result.status).toBe('SUBMITTED');
        });
        it('5b. Uses direct PostgreSQL connection when no client is supplied in normal runtime', async () => {
            const mockPrisma = {
                $queryRaw: jest.fn().mockResolvedValue([{ result: { revision_id: 'rev-db', status: 'SUBMITTED' } }]),
            };
            const repo = new review_repository_1.ReviewRepository(mockPrisma);
            const result = await repo.submitDraftRevision('rev-db');
            expect(mockPrisma.$queryRaw).toHaveBeenCalled();
            expect(result.status).toBe('SUBMITTED');
        });
        it('6. Fails safely on null data response without leaking secrets', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.submitDraftRevision('rev-1')).rejects.toThrow(errors_1.InternalError);
            await expect(repo.submitDraftRevision('rev-1')).rejects.toThrow('submit_draft_revision routine did not return expected result from database');
        });
        it('7. Fails safely on malformed object response (missing status)', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { revision_id: 'rev-1' },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.submitDraftRevision('rev-1')).rejects.toThrow(errors_1.InternalError);
        });
        it('8. Fails safely on primitive response (e.g. number or boolean)', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: 12345,
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.submitDraftRevision('rev-1')).rejects.toThrow(errors_1.InternalError);
        });
    });
    // =========================================================================
    // TASK 13 — TEST recordDecision RPC
    // =========================================================================
    describe('Task 13 — recordDecision RPC', () => {
        it('1. Calls exact RPC function name record_review_decision with exact parameter mapping', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    review_id: 'rw-1',
                    revision_id: 'rev-1',
                    asset_id: 'asset-1',
                    status: 'APPROVED',
                    decision: 'APPROVED',
                },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'admin-1',
                decision: 'APPROVED',
                comments: 'Excellent quality',
            });
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('record_review_decision', {
                p_revision_id: 'rev-1',
                p_reviewer_id: 'admin-1',
                p_decision: 'APPROVED',
                p_comments: 'Excellent quality',
            });
            expect(mockInjectedClient.$queryRaw).not.toHaveBeenCalled();
        });
        it('2. Maps APPROVED result correctly', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    review_id: 'rw-app',
                    revision_id: 'rev-1',
                    asset_id: 'asset-1',
                    status: 'APPROVED',
                    decision: 'APPROVED',
                },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const res = await repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'admin-1',
                decision: 'APPROVED',
                comments: 'Approved design',
            });
            expect(res).toEqual({
                reviewId: 'rw-app',
                revisionId: 'rev-1',
                assetId: 'asset-1',
                status: 'APPROVED',
                decision: 'APPROVED',
            });
        });
        it('3. Maps CHANGES_REQUESTED result correctly', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    review_id: 'rw-cr',
                    revision_id: 'rev-1',
                    asset_id: 'asset-1',
                    status: 'CHANGES_REQUESTED',
                    decision: 'CHANGES_REQUESTED',
                },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const res = await repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'admin-1',
                decision: 'CHANGES_REQUESTED',
                comments: 'Fix typography contrast',
            });
            expect(res.status).toBe('CHANGES_REQUESTED');
            expect(res.decision).toBe('CHANGES_REQUESTED');
        });
        it('4. Maps REJECTED result correctly', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    review_id: 'rw-rej',
                    revision_id: 'rev-1',
                    asset_id: 'asset-1',
                    status: 'REJECTED',
                    decision: 'REJECTED',
                },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const res = await repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'admin-1',
                decision: 'REJECTED',
                comments: 'Policy non-compliant',
            });
            expect(res.status).toBe('REJECTED');
            expect(res.decision).toBe('REJECTED');
        });
        it('5. Preserves null comments behavior and does NOT invent placeholder text', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    review_id: 'rw-null-comments',
                    revision_id: 'rev-1',
                    asset_id: 'asset-1',
                    status: 'APPROVED',
                    decision: 'APPROVED',
                },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'admin-1',
                decision: 'APPROVED',
                comments: null,
            });
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('record_review_decision', expect.objectContaining({
                p_comments: null,
            }));
        });
        it('6. Passes undefined comments as null to PostgreSQL routine', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    review_id: 'rw-undef',
                    revision_id: 'rev-1',
                    asset_id: 'asset-1',
                    status: 'APPROVED',
                    decision: 'APPROVED',
                },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'admin-1',
                decision: 'APPROVED',
            });
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('record_review_decision', expect.objectContaining({
                p_comments: null,
            }));
        });
        it('7. Fails safely on null / malformed response from record_review_decision', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'admin-1',
                decision: 'APPROVED',
            })).rejects.toThrow(errors_1.InternalError);
        });
    });
    // =========================================================================
    // TASK 14 — SECURITY & LIFECYCLE ERROR MAPPING TESTS
    // =========================================================================
    describe('Task 14 — Security & Lifecycle Error Mapping', () => {
        it('Peer-review integrity violation maps to ForbiddenError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Peer-review integrity violation: Author 11111111-1111-1111-1111-111111111111 cannot review or decide their own revision rev-1',
                },
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: '11111111-1111-1111-1111-111111111111',
                decision: 'APPROVED',
            })).rejects.toThrow(errors_1.ForbiddenError);
        });
        it('Reviewer eligibility violation maps to ForbiddenError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Reviewer eligibility violation: User user-not-admin is not an active system administrator (role: CONTRIBUTOR, is_active: true)',
                },
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'user-not-admin',
                decision: 'APPROVED',
            })).rejects.toThrow(errors_1.ForbiddenError);
        });
        it('Cannot submit revision (status not DRAFT) maps to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Cannot submit revision rev-1; current status is SUBMITTED (must be DRAFT)',
                },
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.submitDraftRevision('rev-1')).rejects.toThrow(errors_1.ConflictError);
        });
        it('Cannot record review decision (status not SUBMITTED) maps to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Cannot record review decision for revision rev-1 in status APPROVED (must be SUBMITTED)',
                },
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'admin-1',
                decision: 'APPROVED',
            })).rejects.toThrow(errors_1.ConflictError);
        });
        it('Revision does not exist maps to NotFoundError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'AssetRevision non-existent-rev does not exist',
                },
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.submitDraftRevision('non-existent-rev')).rejects.toThrow(errors_1.NotFoundError);
        });
        it('Unrecognized P0001 exception maps to InternalError without leaking credentials', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Some internal unexpected routine failure with secrets postgresql://secret@localhost',
                },
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            try {
                await repo.submitDraftRevision('rev-1');
                fail('Should have thrown InternalError');
            }
            catch (err) {
                expect(err).toBeInstanceOf(errors_1.InternalError);
                expect(err.message).not.toContain('postgresql://secret');
                expect(err.message).not.toContain('localhost');
            }
        });
        it('Database connection failure (SQLSTATE 08001) maps to ServiceUnavailableError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: '08001',
                    message: 'Connection refused',
                },
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            await expect(repo.submitDraftRevision('rev-1')).rejects.toThrow(expect.objectContaining({ code: 'DATABASE_UNAVAILABLE' }));
        });
    });
    // =========================================================================
    // TASK 15 — SERVICE CONTRACT INTEGRATION & PRESERVATION
    // =========================================================================
    describe('Task 15 — ReviewWorkflowService Contract Integration', () => {
        it('ReviewWorkflowService.submitDraftRevision functions seamlessly with RPC repository', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { revision_id: 'rev-service-1', status: 'SUBMITTED' },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const service = new review_workflow_service_1.ReviewWorkflowService(repo);
            const result = await service.submitDraftRevision('rev-service-1', {
                id: 'contributor-1',
                role: 'CONTRIBUTOR',
            });
            expect(result).toEqual({
                revisionId: 'rev-service-1',
                status: 'SUBMITTED',
            });
        });
        it('ReviewWorkflowService.recordDecision rejects non-ADMIN before reaching repository', async () => {
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const service = new review_workflow_service_1.ReviewWorkflowService(repo);
            await expect(service.recordDecision({ revisionId: 'rev-1', decision: 'APPROVED' }, { id: 'contributor-1', role: 'CONTRIBUTOR' })).rejects.toThrow(errors_1.ForbiddenError);
            expect(mockInjectedClient.rpc).not.toHaveBeenCalled();
        });
        it('ReviewWorkflowService.recordDecision rejects author self-review at service boundary', async () => {
            // Mock findRevisionById using PostgREST mock
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                        id: 'rev-self-1',
                        asset_id: 'asset-1',
                        created_by_id: 'admin-author-id',
                        status: 'SUBMITTED',
                    },
                    error: null,
                }),
            };
            mockInjectedClient.from.mockReturnValue(mockChain);
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const service = new review_workflow_service_1.ReviewWorkflowService(repo);
            await expect(service.recordDecision({ revisionId: 'rev-self-1', decision: 'APPROVED' }, { id: 'admin-author-id', role: 'ADMIN' })).rejects.toThrow('Peer review violation: Author cannot review or decide their own submission.');
            expect(mockInjectedClient.rpc).not.toHaveBeenCalled();
        });
        it('ReviewWorkflowService.recordDecision successfully records decision for eligible admin', async () => {
            // 1. Mock findRevisionById author lookup via PostgREST
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                        id: 'rev-valid-1',
                        asset_id: 'asset-1',
                        created_by_id: 'contributor-author',
                        status: 'SUBMITTED',
                    },
                    error: null,
                }),
            };
            mockInjectedClient.from.mockReturnValue(mockChain);
            // 2. Mock recordDecision via Supabase RPC
            mockInjectedClient.rpc.mockResolvedValue({
                data: {
                    review_id: 'rw-valid-1',
                    revision_id: 'rev-valid-1',
                    asset_id: 'asset-1',
                    status: 'APPROVED',
                    decision: 'APPROVED',
                },
                error: null,
            });
            const repo = new review_repository_1.ReviewRepository(mockInjectedClient);
            const service = new review_workflow_service_1.ReviewWorkflowService(repo);
            const result = await service.recordDecision({ revisionId: 'rev-valid-1', decision: 'APPROVED', comments: 'LGTM' }, { id: 'admin-reviewer', role: 'ADMIN' });
            expect(result).toEqual({
                reviewId: 'rw-valid-1',
                revisionId: 'rev-valid-1',
                assetId: 'asset-1',
                status: 'APPROVED',
                decision: 'APPROVED',
            });
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('record_review_decision', {
                p_revision_id: 'rev-valid-1',
                p_reviewer_id: 'admin-reviewer',
                p_decision: 'APPROVED',
                p_comments: 'LGTM',
            });
        });
    });
});
