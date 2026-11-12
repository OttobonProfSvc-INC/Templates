"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../infrastructure/supabase");
const user_repository_1 = require("../modules/users/user.repository");
const template_repository_1 = require("../modules/templates/template.repository");
const asset_repository_1 = require("../modules/assets/asset.repository");
const review_repository_1 = require("../modules/reviews/review.repository");
const customization_repository_1 = require("../modules/customizations/customization.repository");
const errors_1 = require("../common/errors");
jest.mock('../infrastructure/supabase/client', () => {
    const mockGlobalSupabase = {
        from: jest.fn(),
    };
    return {
        getSupabaseServerClient: jest.fn(() => mockGlobalSupabase),
        resetSupabaseServerClient: jest.fn(),
    };
});
describe('API-2 Corrective Pass: Transaction-Safe Routing & Read-Your-Writes', () => {
    let mockGlobalSupabase;
    beforeEach(() => {
        jest.clearAllMocks();
        mockGlobalSupabase = (0, supabase_1.getSupabaseServerClient)();
    });
    // =========================================================================
    // TASK 2 — VERIFY TRANSACTION-SAFE ROUTING (Cases A, B, C, D)
    // =========================================================================
    describe('Task 2 — Client Context Resolution (resolveClientContext)', () => {
        it('CASE A: returns global/default Supabase client when no context is supplied', () => {
            const resolved = (0, supabase_1.resolveClientContext)();
            expect(resolved.kind).toBe('supabase');
            expect(resolved.client).toBe(mockGlobalSupabase);
        });
        it('CASE A: returns injected default Supabase client when supplied', () => {
            const injectedSupabase = { from: jest.fn() };
            const resolved = (0, supabase_1.resolveClientContext)(undefined, injectedSupabase);
            expect(resolved.kind).toBe('supabase');
            expect(resolved.client).toBe(injectedSupabase);
        });
        it('CASE B: returns supplied Supabase client when object has .from', () => {
            const customSupabase = { from: jest.fn() };
            const resolved = (0, supabase_1.resolveClientContext)(customSupabase);
            expect(resolved.kind).toBe('supabase');
            expect(resolved.client).toBe(customSupabase);
        });
        it('CASE C: returns supplied Prisma TransactionClient when object has Prisma delegate methods', () => {
            const mockTxClient = {
                asset: { findUnique: jest.fn() },
                $queryRaw: jest.fn(),
            };
            const resolved = (0, supabase_1.resolveClientContext)(mockTxClient);
            expect(resolved.kind).toBe('prisma');
            expect(resolved.client).toBe(mockTxClient);
        });
        it('CASE D: throws InternalError safely when context is unsupported (unknown object)', () => {
            expect(() => (0, supabase_1.resolveClientContext)({ unknownProperty: 123 })).toThrow(errors_1.InternalError);
            expect(() => (0, supabase_1.resolveClientContext)({ unknownProperty: 123 })).toThrow('Unsupported database or client execution context');
        });
        it('CASE D: throws InternalError safely when context is an invalid primitive', () => {
            expect(() => (0, supabase_1.resolveClientContext)('invalid-context')).toThrow(errors_1.InternalError);
            expect(() => (0, supabase_1.resolveClientContext)(42)).toThrow(errors_1.InternalError);
        });
        it('CONFIRM EXPLICITLY: isPrismaClient detects Prisma TransactionClient and never classifies it as Supabase', () => {
            const mockTxClient = {
                asset: { findUnique: jest.fn() },
                $queryRaw: jest.fn(),
            };
            expect((0, supabase_1.isPrismaClient)(mockTxClient)).toBe(true);
            expect((0, supabase_1.isSupabaseClient)(mockTxClient)).toBe(false);
        });
    });
    // =========================================================================
    // TASK 2 & 4 — REPOSITORY-SPECIFIC TRANSACTION-SAFE ROUTING & READ-YOUR-WRITES
    // =========================================================================
    describe('Task 2 & 4 — UserRepository Transaction Routing', () => {
        it('uses PostgREST when no tx is passed (CASE A)', async () => {
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', role: 'ADMIN', is_active: true },
                    error: null,
                }),
            };
            mockGlobalSupabase.from.mockReturnValue(mockChain);
            const repo = new user_repository_1.UserRepository(mockGlobalSupabase);
            const user = await repo.findAuthUserById('a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d');
            expect(mockGlobalSupabase.from).toHaveBeenCalledWith('users_templatedhub');
            expect(user?.role).toBe('ADMIN');
            expect(user?.isActive).toBe(true);
        });
        it('uses supplied Prisma TransactionClient and does NOT call global Supabase (CASE C)', async () => {
            const mockTx = {
                user: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
                        role: 'CONTRIBUTOR',
                        isActive: true,
                    }),
                },
                $queryRaw: jest.fn(),
            };
            const repo = new user_repository_1.UserRepository();
            const user = await repo.findAuthUserById('a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', mockTx);
            expect(mockTx.user.findUnique).toHaveBeenCalledWith({
                where: { id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d' },
                select: { id: true, role: true, isActive: true },
            });
            expect(mockGlobalSupabase.from).not.toHaveBeenCalled();
            expect(user?.role).toBe('CONTRIBUTOR');
            expect(user?.isActive).toBe(true);
        });
        it('fails safely with InternalError when unsupported context is passed (CASE D)', async () => {
            const repo = new user_repository_1.UserRepository();
            await expect(repo.findAuthUserById('a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', { weird: 'context' })).rejects.toThrow(errors_1.InternalError);
        });
    });
    describe('Task 2 & 4 — CustomizationRepository Transaction Routing & Read-Your-Writes', () => {
        it('uses PostgREST when no tx is passed (CASE A)', async () => {
            const mockChain = {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                        id: 'cust-1',
                        slug: 'design-cust-1',
                        type_id: 'type-1',
                        creator_id: 'user-1',
                        status: 'DRAFT',
                        remix_source_asset_id: 'base-1',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        revisions: [],
                    },
                    error: null,
                }),
            };
            mockGlobalSupabase.from.mockReturnValue(mockChain);
            const repo = new customization_repository_1.CustomizationRepository(mockGlobalSupabase);
            const result = await repo.findCustomizationById('cust-1');
            expect(mockGlobalSupabase.from).toHaveBeenCalledWith('assets_templatedhub');
            expect(result?.id).toBe('cust-1');
            expect(result?.creatorId).toBe('user-1');
            expect(result?.createdAt).toBeInstanceOf(Date);
        });
        it('Task 4: Read-Your-Writes — verifies Prisma tx write -> repository read in SAME Prisma tx', async () => {
            const mockGlobalPrisma = {
                asset: { findUnique: jest.fn() },
                $queryRaw: jest.fn(),
            };
            // Simulated transaction client
            const mockTxClient = {
                asset: {
                    create: jest.fn().mockResolvedValue({
                        id: 'cust-write-1',
                        slug: 'design-write-1',
                        typeId: 'type-1',
                        creatorId: 'user-writer',
                        status: 'DRAFT',
                        lastRevisionNumber: 0,
                        remixSourceAssetId: 'base-1',
                        remixSourceRevisionId: 'rev-base-1',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }),
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'cust-write-1',
                        slug: 'design-write-1',
                        typeId: 'type-1',
                        creatorId: 'user-writer',
                        status: 'DRAFT',
                        lastRevisionNumber: 1,
                        remixSourceAssetId: 'base-1',
                        remixSourceRevisionId: 'rev-base-1',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        revisions: [
                            {
                                id: 'rev-write-1',
                                assetId: 'cust-write-1',
                                revisionNumber: 1,
                                title: 'Uncommitted In-Tx Title',
                                status: 'DRAFT',
                                createdById: 'user-writer',
                                createdAt: new Date(),
                            },
                        ],
                        remixSourceAsset: null,
                    }),
                },
                $queryRaw: jest.fn(),
            };
            const repo = new customization_repository_1.CustomizationRepository(mockGlobalPrisma);
            // 1. Transactional write step
            await mockTxClient.asset.create({
                data: { id: 'cust-write-1' },
            });
            // 2. Repository read step within the SAME transaction
            const readResult = await repo.findCustomizationById('cust-write-1', mockTxClient);
            // 3. Verifications:
            // a. Supplied transaction client read called
            expect(mockTxClient.asset.findUnique).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'cust-write-1' },
            }));
            // b. Global Supabase client was NOT called
            expect(mockGlobalSupabase.from).not.toHaveBeenCalled();
            // c. Global Prisma client was NOT called
            expect(mockGlobalPrisma.asset.findUnique).not.toHaveBeenCalled();
            // d. Domain return shape preserved
            expect(readResult).toBeDefined();
            expect(readResult?.id).toBe('cust-write-1');
            expect(readResult?.creatorId).toBe('user-writer');
            expect(readResult?.revisions[0]?.title).toBe('Uncommitted In-Tx Title');
            expect(readResult?.createdAt).toBeInstanceOf(Date);
            expect(readResult?.updatedAt).toBeInstanceOf(Date);
        });
        it('listCustomizationsByUserId uses supplied Prisma tx and filters by owner', async () => {
            const mockTxClient = {
                asset: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            id: 'cust-owned-1',
                            slug: 'design-owned-1',
                            typeId: 'type-1',
                            creatorId: 'user-owner',
                            status: 'DRAFT',
                            remixSourceAssetId: 'base-1',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            revisions: [],
                            remixSourceAsset: null,
                        },
                    ]),
                },
                $queryRaw: jest.fn(),
            };
            const repo = new customization_repository_1.CustomizationRepository();
            const results = await repo.listCustomizationsByUserId('user-owner', mockTxClient);
            expect(mockTxClient.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    creatorId: 'user-owner',
                    remixSourceAssetId: { not: null },
                },
            }));
            expect(mockGlobalSupabase.from).not.toHaveBeenCalled();
            expect(results).toHaveLength(1);
            expect(results[0].creatorId).toBe('user-owner');
        });
        it('fails safely with InternalError on unsupported context (CASE D)', async () => {
            const repo = new customization_repository_1.CustomizationRepository();
            await expect(repo.findCustomizationById('cust-1', { bogus: true })).rejects.toThrow(errors_1.InternalError);
        });
    });
    describe('Task 2 & 4 — TemplateRepository Transaction Routing', () => {
        it('uses supplied Prisma tx for findPublishedTemplates, findPublishedTemplateById, findBaseTemplateForRemix', async () => {
            const mockTx = {
                asset: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            id: 'tmpl-1',
                            slug: 'template-1',
                            typeId: 'type-1',
                            creatorId: 'admin-1',
                            status: 'PUBLISHED',
                            remixSourceAssetId: null,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            type: { id: 'type-1', code: 'social-post', name: 'Social Post', isActive: true },
                            revisions: [
                                {
                                    id: 'rev-1',
                                    assetId: 'tmpl-1',
                                    revisionNumber: 1,
                                    title: 'Published Rev',
                                    status: 'PUBLISHED',
                                    createdById: 'admin-1',
                                    files: [],
                                },
                            ],
                        },
                    ]),
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'tmpl-1',
                        slug: 'template-1',
                        typeId: 'type-1',
                        creatorId: 'admin-1',
                        status: 'PUBLISHED',
                        remixSourceAssetId: null,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        type: { id: 'type-1', code: 'social-post', name: 'Social Post', isActive: true },
                        revisions: [
                            {
                                id: 'rev-1',
                                assetId: 'tmpl-1',
                                revisionNumber: 1,
                                title: 'Published Rev',
                                status: 'PUBLISHED',
                                createdById: 'admin-1',
                                files: [],
                            },
                        ],
                    }),
                },
                $queryRaw: jest.fn(),
            };
            const repo = new template_repository_1.TemplateRepository();
            const templates = await repo.findPublishedTemplates(mockTx);
            expect(mockTx.asset.findMany).toHaveBeenCalled();
            expect(templates[0].id).toBe('tmpl-1');
            const template = await repo.findPublishedTemplateById('tmpl-1', mockTx);
            expect(mockTx.asset.findFirst).toHaveBeenCalled();
            expect(template?.id).toBe('tmpl-1');
            const remixBase = await repo.findBaseTemplateForRemix('tmpl-1', mockTx);
            expect(remixBase?.id).toBe('tmpl-1');
            expect(mockGlobalSupabase.from).not.toHaveBeenCalled();
        });
        it('fails safely with InternalError on unsupported context (CASE D)', async () => {
            const repo = new template_repository_1.TemplateRepository();
            await expect(repo.findPublishedTemplates({ invalid: true })).rejects.toThrow(errors_1.InternalError);
        });
    });
    describe('Task 2 & 4 — AssetRepository Transaction Routing', () => {
        it('uses supplied Prisma tx for findAssetById', async () => {
            const mockTx = {
                asset: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'asset-1',
                        slug: 'asset-slug-1',
                        typeId: 'type-1',
                        creatorId: 'admin-1',
                        status: 'PUBLISHED',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        type: { id: 'type-1', code: 'social-post', name: 'Social Post', isActive: true },
                        revisions: [],
                    }),
                },
                $queryRaw: jest.fn(),
            };
            const repo = new asset_repository_1.AssetRepository();
            const asset = await repo.findAssetById('asset-1', mockTx);
            expect(mockTx.asset.findUnique).toHaveBeenCalledWith({
                where: { id: 'asset-1' },
                include: expect.anything(),
            });
            expect(mockGlobalSupabase.from).not.toHaveBeenCalled();
            expect(asset?.id).toBe('asset-1');
        });
        it('fails safely with InternalError on unsupported context (CASE D)', async () => {
            const repo = new asset_repository_1.AssetRepository();
            await expect(repo.findAssetById('asset-1', { unsupported: true })).rejects.toThrow(errors_1.InternalError);
        });
    });
    describe('Task 2 & 4 — ReviewRepository Transaction Routing', () => {
        it('uses supplied Prisma tx for findReviewsByRevisionId and findRevisionById', async () => {
            const mockTx = {
                review: {
                    findMany: jest.fn().mockResolvedValue([
                        {
                            id: 'rev-rec-1',
                            assetId: 'asset-1',
                            revisionId: 'rev-1',
                            reviewerId: 'user-reviewer',
                            previousStatus: 'DRAFT',
                            newStatus: 'APPROVED',
                            decision: 'APPROVE',
                            comments: 'Good',
                            createdAt: new Date(),
                            reviewer: { id: 'user-reviewer', name: 'Reviewer', role: 'ADMIN' },
                        },
                    ]),
                },
                assetRevision: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'rev-1',
                        assetId: 'asset-1',
                        revisionNumber: 1,
                        createdById: 'author-1',
                        status: 'DRAFT',
                    }),
                },
                $queryRaw: jest.fn(),
            };
            const repo = new review_repository_1.ReviewRepository();
            const reviews = await repo.findReviewsByRevisionId('rev-1', mockTx);
            expect(mockTx.review.findMany).toHaveBeenCalledWith({
                where: { revisionId: 'rev-1' },
                orderBy: { createdAt: 'desc' },
                include: expect.anything(),
            });
            expect(reviews[0].decision).toBe('APPROVE');
            expect(reviews[0].reviewer.role).toBe('ADMIN');
            const summary = await repo.findRevisionById('rev-1', mockTx);
            expect(mockTx.assetRevision.findUnique).toHaveBeenCalledWith({
                where: { id: 'rev-1' },
                select: expect.anything(),
            });
            expect(summary?.id).toBe('rev-1');
            expect(summary?.createdById).toBe('author-1');
            expect(mockGlobalSupabase.from).not.toHaveBeenCalled();
        });
        it('fails safely with InternalError on unsupported context (CASE D)', async () => {
            const repo = new review_repository_1.ReviewRepository();
            await expect(repo.findReviewsByRevisionId('rev-1', { bad: 'context' })).rejects.toThrow(errors_1.InternalError);
            await expect(repo.findRevisionById('rev-1', { bad: 'context' })).rejects.toThrow(errors_1.InternalError);
        });
    });
});
