"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const user_repository_1 = require("../modules/users/user.repository");
const template_repository_1 = require("../modules/templates/template.repository");
const asset_repository_1 = require("../modules/assets/asset.repository");
const review_repository_1 = require("../modules/reviews/review.repository");
const customization_repository_1 = require("../modules/customizations/customization.repository");
const errors_1 = require("../common/errors");
describe('API-2: Read-Only Repository Migration to Supabase Data API', () => {
    let mockSupabase;
    let mockChain;
    beforeEach(() => {
        mockChain = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            ilike: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
        // When chain is directly awaited (promise-like result for list queries)
        mockChain.then = (resolve) => resolve({ data: [], error: null });
        mockSupabase = {
            from: jest.fn().mockReturnValue(mockChain),
        };
    });
    // =========================================================================
    // TASK 13 — USER REPOSITORY READ TESTS
    // =========================================================================
    describe('UserRepository.findAuthUserById', () => {
        it('returns valid mapped user with snake_case is_active -> isActive', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '11111111-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: userId, role: 'CONTRIBUTOR', is_active: true },
                error: null,
            });
            const user = await repo.findAuthUserById(userId);
            expect(user).toEqual({
                id: userId,
                role: 'CONTRIBUTOR',
                isActive: true,
            });
            expect(mockSupabase.from).toHaveBeenCalledWith('users_templatedhub');
            expect(mockChain.select).toHaveBeenCalledWith('id, role, is_active');
            expect(mockChain.eq).toHaveBeenCalledWith('id', userId);
        });
        it('returns null when user does not exist in database', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '22222222-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });
            const user = await repo.findAuthUserById(userId);
            expect(user).toBeNull();
        });
        it('returns null without executing DB query when subjectId is invalid UUID format', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const res1 = await repo.findAuthUserById('not-a-uuid');
            const res2 = await repo.findAuthUserById('');
            const res3 = await repo.findAuthUserById(null);
            expect(res1).toBeNull();
            expect(res2).toBeNull();
            expect(res3).toBeNull();
            expect(mockSupabase.from).not.toHaveBeenCalled();
        });
        it('correctly maps inactive user row with isActive: false', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '33333333-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: userId, role: 'ADMIN', is_active: false },
                error: null,
            });
            const user = await repo.findAuthUserById(userId);
            expect(user).toEqual({
                id: userId,
                role: 'ADMIN',
                isActive: false,
            });
        });
        it('preserves ADMIN role from database authority', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '44444444-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: userId, role: 'ADMIN', is_active: true },
                error: null,
            });
            const user = await repo.findAuthUserById(userId);
            expect(user?.role).toBe('ADMIN');
        });
        it('preserves CONTRIBUTOR role from database authority', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '55555555-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: userId, role: 'CONTRIBUTOR', is_active: true },
                error: null,
            });
            const user = await repo.findAuthUserById(userId);
            expect(user?.role).toBe('CONTRIBUTOR');
        });
        it('returns null if database row contains unrecognized invalid role', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '66666666-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: userId, role: 'SUPERUSER', is_active: true },
                error: null,
            });
            const user = await repo.findAuthUserById(userId);
            expect(user).toBeNull();
        });
        it('fails safely with InternalError on PostgREST database error without leaking credentials', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '77777777-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: { message: 'connection timeout', code: 'PGRST001' },
            });
            await expect(repo.findAuthUserById(userId)).rejects.toThrow(errors_1.InternalError);
            await expect(repo.findAuthUserById(userId)).rejects.toThrow(/Database read error/);
        });
    });
    describe('UserRepository.findAuthUserByEmail', () => {
        it('returns valid mapped user when queried with mixed-case email', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '11111111-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: userId, role: 'ADMIN', is_active: true },
                error: null,
            });
            const user = await repo.findAuthUserByEmail('  Admin@SBloom.com ');
            expect(user).toEqual({
                id: userId,
                role: 'ADMIN',
                isActive: true,
            });
            expect(mockSupabase.from).toHaveBeenCalledWith('users_templatedhub');
            expect(mockChain.select).toHaveBeenCalledWith('id, role, is_active');
            expect(mockChain.ilike).toHaveBeenCalledWith('email', 'admin@sbloom.com');
        });
        it('returns null when email does not exist in database', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });
            const user = await repo.findAuthUserByEmail('nonexistent@sbloom.com');
            expect(user).toBeNull();
        });
        it('returns null without executing DB query when email is empty or invalid', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const res1 = await repo.findAuthUserByEmail('');
            const res2 = await repo.findAuthUserByEmail('   ');
            const res3 = await repo.findAuthUserByEmail(null);
            expect(res1).toBeNull();
            expect(res2).toBeNull();
            expect(res3).toBeNull();
            expect(mockSupabase.from).not.toHaveBeenCalled();
        });
    });
    describe('UserRepository.findAuthUserByIdOrEmail', () => {
        it('prefers email resolution when email matches an existing user', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '11111111-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: userId, role: 'ADMIN', is_active: true },
                error: null,
            });
            const user = await repo.findAuthUserByIdOrEmail('1', 'admin@sbloom.com');
            expect(user).toEqual({
                id: userId,
                role: 'ADMIN',
                isActive: true,
            });
            expect(mockChain.ilike).toHaveBeenCalledWith('email', 'admin@sbloom.com');
        });
        it('falls back to UUID id resolution when email is null/empty', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            const userId = '11111111-2222-3333-4444-555555555555';
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: userId, role: 'CONTRIBUTOR', is_active: true },
                error: null,
            });
            const user = await repo.findAuthUserByIdOrEmail(userId, undefined);
            expect(user).toEqual({
                id: userId,
                role: 'CONTRIBUTOR',
                isActive: true,
            });
            expect(mockChain.eq).toHaveBeenCalledWith('id', userId);
        });
        it('returns null when neither email matches nor identifier is a valid UUID', async () => {
            const repo = new user_repository_1.UserRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });
            const user = await repo.findAuthUserByIdOrEmail('non-uuid-1', 'notfound@sbloom.com');
            expect(user).toBeNull();
        });
    });
    // =========================================================================
    // TASK 14 — TEMPLATE REPOSITORY READ TESTS
    // =========================================================================
    describe('TemplateRepository', () => {
        const rawTemplateRow = {
            id: 'tmpl-1',
            slug: 'social-post-summer',
            legacy_id: 'legacy-1',
            import_source: 'template-library/social-media',
            type_id: 'type-1',
            creator_id: 'user-admin',
            status: 'PUBLISHED',
            last_revision_number: 1,
            current_published_revision_id: 'rev-1',
            remix_source_asset_id: null,
            remix_source_revision_id: null,
            is_featured: true,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            archived_at: null,
            type: {
                id: 'type-1',
                code: 'social-post',
                name: 'Social Post',
                description: 'Social post template',
                icon: 'image',
                metadata_schema: {},
                file_rules: null,
                schema_version: 1,
                is_active: true,
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
            },
            revisions: [
                {
                    id: 'rev-1',
                    asset_id: 'tmpl-1',
                    revision_number: 1,
                    title: 'Summer Sale',
                    description: 'Special summer discount',
                    metadata: { canvas: { width: 1080, height: 1350 } },
                    schema_version: 1,
                    status: 'PUBLISHED',
                    deciding_review_id: null,
                    created_by_id: 'user-admin',
                    created_at: '2026-01-01T00:00:00.000Z',
                    files: [
                        {
                            id: 'file-1',
                            revision_id: 'rev-1',
                            storage_key: 'templates/tmpl-1/rev-1/image.png',
                            file_name: 'image.png',
                            mime_type: 'image/png',
                            size_bytes: 1024,
                            checksum_sha256: 'abc123',
                            role: 'PRIMARY_ENTRY',
                            is_entry_point: true,
                            created_at: '2026-01-01T00:00:00.000Z',
                        },
                    ],
                },
            ],
        };
        it('findPublishedTemplates maps published template list and relations correctly', async () => {
            const repo = new template_repository_1.TemplateRepository(undefined, mockSupabase);
            mockChain.then = (resolve) => resolve({ data: [rawTemplateRow], error: null });
            const templates = await repo.findPublishedTemplates();
            expect(templates).toHaveLength(1);
            const tmpl = templates[0];
            expect(tmpl.id).toBe('tmpl-1');
            expect(tmpl.slug).toBe('social-post-summer');
            expect(tmpl.typeId).toBe('type-1');
            expect(tmpl.type?.name).toBe('Social Post');
            expect(tmpl.revisions).toHaveLength(1);
            expect(tmpl.revisions[0].title).toBe('Summer Sale');
            expect(tmpl.revisions[0].files).toHaveLength(1);
            expect(tmpl.revisions[0].files[0].fileName).toBe('image.png');
            expect(tmpl.createdAt).toBeInstanceOf(Date);
            expect(mockChain.eq).toHaveBeenCalledWith('status', 'PUBLISHED');
            expect(mockChain.is).toHaveBeenCalledWith('remix_source_asset_id', null);
        });
        it('findPublishedTemplates excludes non-published revisions within template', async () => {
            const repo = new template_repository_1.TemplateRepository(undefined, mockSupabase);
            const templateWithDraftRev = {
                ...rawTemplateRow,
                revisions: [
                    { ...rawTemplateRow.revisions[0], id: 'rev-draft', status: 'DRAFT', revision_number: 2 },
                    { ...rawTemplateRow.revisions[0], id: 'rev-pub', status: 'PUBLISHED', revision_number: 1 },
                ],
            };
            mockChain.then = (resolve) => resolve({ data: [templateWithDraftRev], error: null });
            const templates = await repo.findPublishedTemplates();
            expect(templates[0].revisions).toHaveLength(1);
            expect(templates[0].revisions[0].id).toBe('rev-pub');
        });
        it('findPublishedTemplateById returns mapped template by ID', async () => {
            const repo = new template_repository_1.TemplateRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: rawTemplateRow,
                error: null,
            });
            const tmpl = await repo.findPublishedTemplateById('tmpl-1');
            expect(tmpl).not.toBeNull();
            expect(tmpl?.id).toBe('tmpl-1');
            expect(tmpl?.slug).toBe('social-post-summer');
            expect(tmpl?.type?.code).toBe('social-post');
        });
        it('findPublishedTemplateById returns null when template ID not found', async () => {
            const repo = new template_repository_1.TemplateRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });
            const tmpl = await repo.findPublishedTemplateById('nonexistent');
            expect(tmpl).toBeNull();
        });
        it('findPublishedTemplateById returns null if asset is a remix (remixSourceAssetId not null)', async () => {
            const repo = new template_repository_1.TemplateRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: { ...rawTemplateRow, remix_source_asset_id: 'parent-asset-1' },
                error: null,
            });
            const tmpl = await repo.findPublishedTemplateById('tmpl-1');
            expect(tmpl).toBeNull();
        });
        it('findBaseTemplateForRemix returns base template with published revision', async () => {
            const repo = new template_repository_1.TemplateRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: rawTemplateRow,
                error: null,
            });
            const base = await repo.findBaseTemplateForRemix('tmpl-1');
            expect(base).not.toBeNull();
            expect(base?.id).toBe('tmpl-1');
            expect(base?.typeId).toBe('type-1');
            expect(base?.revisions[0].title).toBe('Summer Sale');
        });
        it('findBaseTemplateForRemix handles template with empty revisions safely', async () => {
            const repo = new template_repository_1.TemplateRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: { ...rawTemplateRow, revisions: [] },
                error: null,
            });
            const base = await repo.findBaseTemplateForRemix('tmpl-1');
            expect(base).not.toBeNull();
            expect(base?.revisions).toEqual([]);
        });
        it('findPublishedTemplates fails safely on PostgREST error', async () => {
            const repo = new template_repository_1.TemplateRepository(undefined, mockSupabase);
            mockChain.then = (resolve) => resolve({ data: null, error: { message: 'DB down', code: 'PGRST500' } });
            await expect(repo.findPublishedTemplates()).rejects.toThrow(errors_1.InternalError);
        });
    });
    // =========================================================================
    // TASK 15 — ASSET REPOSITORY READ TESTS
    // =========================================================================
    describe('AssetRepository.findAssetById', () => {
        it('returns valid asset with mapped relations', async () => {
            const repo = new asset_repository_1.AssetRepository(undefined, mockSupabase);
            const assetId = 'asset-1';
            mockChain.maybeSingle.mockResolvedValue({
                data: {
                    id: assetId,
                    slug: 'asset-slug',
                    type_id: 'type-1',
                    creator_id: 'user-1',
                    status: 'DRAFT',
                    last_revision_number: 1,
                    created_at: '2026-01-01T00:00:00.000Z',
                    updated_at: '2026-01-01T00:00:00.000Z',
                    type: {
                        id: 'type-1',
                        code: 'social-post',
                        name: 'Social Post',
                        schema_version: 1,
                        is_active: true,
                    },
                    revisions: [
                        {
                            id: 'rev-1',
                            asset_id: assetId,
                            revision_number: 1,
                            title: 'Draft Rev',
                            status: 'DRAFT',
                            created_by_id: 'user-1',
                            created_at: '2026-01-01T00:00:00.000Z',
                        },
                    ],
                },
                error: null,
            });
            const asset = await repo.findAssetById(assetId);
            expect(asset).not.toBeNull();
            expect(asset?.id).toBe(assetId);
            expect(asset?.typeId).toBe('type-1');
            expect(asset?.type?.name).toBe('Social Post');
            expect(asset?.revisions).toHaveLength(1);
            expect(asset?.revisions[0].title).toBe('Draft Rev');
            expect(asset?.createdAt).toBeInstanceOf(Date);
        });
        it('returns null when asset is not found', async () => {
            const repo = new asset_repository_1.AssetRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });
            const asset = await repo.findAssetById('nonexistent');
            expect(asset).toBeNull();
        });
        it('fails safely with InternalError on PostgREST error', async () => {
            const repo = new asset_repository_1.AssetRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: { message: 'read failure', code: 'PGRST100' },
            });
            await expect(repo.findAssetById('asset-1')).rejects.toThrow(errors_1.InternalError);
        });
    });
    // =========================================================================
    // TASK 16 — REVIEW REPOSITORY READ TESTS
    // =========================================================================
    describe('ReviewRepository reads', () => {
        it('findReviewsByRevisionId returns list of reviews with mapped reviewer relation', async () => {
            const repo = new review_repository_1.ReviewRepository(undefined, mockSupabase);
            const revisionId = 'rev-1';
            mockChain.then = (resolve) => resolve({
                data: [
                    {
                        id: 'review-1',
                        asset_id: 'asset-1',
                        revision_id: revisionId,
                        reviewer_id: 'admin-1',
                        previous_status: 'SUBMITTED',
                        new_status: 'APPROVED',
                        decision: 'APPROVED',
                        comments: 'LGTM',
                        created_at: '2026-01-02T00:00:00.000Z',
                        reviewer: {
                            id: 'admin-1',
                            name: 'Lead Admin',
                            role: 'ADMIN',
                        },
                    },
                ],
                error: null,
            });
            const reviews = await repo.findReviewsByRevisionId(revisionId);
            expect(reviews).toHaveLength(1);
            expect(reviews[0].id).toBe('review-1');
            expect(reviews[0].decision).toBe('APPROVED');
            expect(reviews[0].reviewer.name).toBe('Lead Admin');
            expect(reviews[0].reviewer.role).toBe('ADMIN');
            expect(reviews[0].createdAt).toBeInstanceOf(Date);
            expect(mockChain.eq).toHaveBeenCalledWith('revision_id', revisionId);
        });
        it('findReviewsByRevisionId returns empty array when revision has no reviews', async () => {
            const repo = new review_repository_1.ReviewRepository(undefined, mockSupabase);
            mockChain.then = (resolve) => resolve({ data: [], error: null });
            const reviews = await repo.findReviewsByRevisionId('rev-empty');
            expect(reviews).toEqual([]);
        });
        it('findRevisionById returns revision summary for author check', async () => {
            const repo = new review_repository_1.ReviewRepository(undefined, mockSupabase);
            const revisionId = 'rev-1';
            mockChain.maybeSingle.mockResolvedValue({
                data: {
                    id: revisionId,
                    asset_id: 'asset-1',
                    created_by_id: 'author-user-1',
                    status: 'SUBMITTED',
                },
                error: null,
            });
            const rev = await repo.findRevisionById(revisionId);
            expect(rev).toEqual({
                id: revisionId,
                assetId: 'asset-1',
                createdById: 'author-user-1',
                status: 'SUBMITTED',
            });
            expect(mockChain.select).toHaveBeenCalledWith('id, asset_id, created_by_id, status');
        });
        it('findRevisionById returns null when revision not found', async () => {
            const repo = new review_repository_1.ReviewRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });
            const rev = await repo.findRevisionById('missing-rev');
            expect(rev).toBeNull();
        });
        it('findReviewsByRevisionId fails safely on PostgREST error', async () => {
            const repo = new review_repository_1.ReviewRepository(undefined, mockSupabase);
            mockChain.then = (resolve) => resolve({ data: null, error: { message: 'Database error', code: 'PGRST500' } });
            await expect(repo.findReviewsByRevisionId('rev-1')).rejects.toThrow(errors_1.InternalError);
        });
    });
    // =========================================================================
    // TASK 17 — CUSTOMIZATION REPOSITORY READ TESTS
    // =========================================================================
    describe('CustomizationRepository reads', () => {
        const rawCustomizationRow = {
            id: 'custom-1',
            slug: 'design-abc123',
            legacy_id: null,
            import_source: null,
            type_id: 'type-1',
            creator_id: 'creator-user-1',
            status: 'DRAFT',
            last_revision_number: 1,
            current_published_revision_id: null,
            remix_source_asset_id: 'parent-tmpl-1',
            remix_source_revision_id: 'parent-rev-1',
            is_featured: false,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            archived_at: null,
            remix_source_asset: {
                id: 'parent-tmpl-1',
                slug: 'social-post-master',
                revisions: [
                    {
                        id: 'parent-rev-1',
                        asset_id: 'parent-tmpl-1',
                        revision_number: 1,
                        title: 'Master Template',
                        status: 'PUBLISHED',
                        created_by_id: 'admin-1',
                        created_at: '2026-01-01T00:00:00.000Z',
                    },
                ],
            },
            revisions: [
                {
                    id: 'custom-rev-1',
                    asset_id: 'custom-1',
                    revision_number: 1,
                    title: 'My Custom Design',
                    metadata: { canvas: { width: 1080, height: 1350 } },
                    status: 'DRAFT',
                    created_by_id: 'creator-user-1',
                    created_at: '2026-01-01T00:00:00.000Z',
                },
            ],
        };
        it('findCustomizationById returns customization with mapped remix source and revisions', async () => {
            const repo = new customization_repository_1.CustomizationRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: rawCustomizationRow,
                error: null,
            });
            const customization = await repo.findCustomizationById('custom-1');
            expect(customization).not.toBeNull();
            expect(customization?.id).toBe('custom-1');
            expect(customization?.creatorId).toBe('creator-user-1');
            expect(customization?.remixSourceAssetId).toBe('parent-tmpl-1');
            expect(customization?.remixSourceAsset?.revisions[0].title).toBe('Master Template');
            expect(customization?.revisions[0].title).toBe('My Custom Design');
            expect(customization?.createdAt).toBeInstanceOf(Date);
            expect(customization?.updatedAt).toBeInstanceOf(Date);
        });
        it('findCustomizationById returns null if asset is not a remix (remixSourceAssetId is null)', async () => {
            const repo = new customization_repository_1.CustomizationRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: { ...rawCustomizationRow, remix_source_asset_id: null },
                error: null,
            });
            const customization = await repo.findCustomizationById('custom-1');
            expect(customization).toBeNull();
        });
        it('findCustomizationById returns null when customization does not exist', async () => {
            const repo = new customization_repository_1.CustomizationRepository(undefined, mockSupabase);
            mockChain.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });
            const customization = await repo.findCustomizationById('nonexistent');
            expect(customization).toBeNull();
        });
        it('listCustomizationsByUserId lists private customizations filtered by owner', async () => {
            const repo = new customization_repository_1.CustomizationRepository(undefined, mockSupabase);
            const userId = 'creator-user-1';
            mockChain.then = (resolve) => resolve({ data: [rawCustomizationRow], error: null });
            const customizations = await repo.listCustomizationsByUserId(userId);
            expect(customizations).toHaveLength(1);
            expect(customizations[0].creatorId).toBe(userId);
            expect(mockChain.eq).toHaveBeenCalledWith('creator_id', userId);
            expect(mockChain.not).toHaveBeenCalledWith('remix_source_asset_id', 'is', null);
            expect(mockChain.order).toHaveBeenCalledWith('updated_at', { ascending: false });
        });
        it('listCustomizationsByUserId returns empty array when user owns no customizations', async () => {
            const repo = new customization_repository_1.CustomizationRepository(undefined, mockSupabase);
            mockChain.then = (resolve) => resolve({ data: [], error: null });
            const customizations = await repo.listCustomizationsByUserId('user-no-designs');
            expect(customizations).toEqual([]);
        });
        it('listCustomizationsByUserId fails safely on PostgREST database error', async () => {
            const repo = new customization_repository_1.CustomizationRepository(undefined, mockSupabase);
            mockChain.then = (resolve) => resolve({ data: null, error: { message: 'Query failed', code: 'PGRST500' } });
            await expect(repo.listCustomizationsByUserId('creator-user-1')).rejects.toThrow(errors_1.InternalError);
        });
    });
});
