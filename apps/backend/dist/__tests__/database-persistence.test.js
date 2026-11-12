"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_template_service_1 = require("../database-template-service");
describe('Database-Backed Persistence Service (Prisma & 11-Table Schema)', () => {
    const baseAssetId = '11111111-1111-4111-a111-111111111111';
    const baseRevisionId = '22222222-2222-4222-a222-222222222222';
    const typeId = '33333333-3333-4333-a333-333333333333';
    const userId = '44444444-4444-4444-a444-444444444444';
    const otherUserId = '55555555-5555-4555-a555-555555555555';
    const sampleDoc = {
        documentVersion: 1,
        canvas: {
            width: 1080,
            height: 1350,
            backgroundColor: '#ffffff',
            backgroundImageUrl: '/api/assets/raw/Coaching/1.jpg',
        },
        elements: [
            {
                id: 'el-1',
                type: 'text',
                name: 'Heading',
                x: 100,
                y: 100,
                width: 800,
                height: 100,
                text: 'Admissions Open',
                fontSize: 48,
                fontFamily: 'Inter',
                fontWeight: 'bold',
                textAlign: 'center',
                color: '#ffffff',
                zIndex: 1,
                isEditable: true,
                isLocked: false,
            },
        ],
    };
    const mockBaseAsset = {
        id: baseAssetId,
        slug: 'coaching-post-1',
        type_id: typeId,
        typeId,
        creator_id: userId,
        creatorId: userId,
        status: 'PUBLISHED',
        import_source: 'template-library/social-media',
        importSource: 'template-library/social-media',
        last_revision_number: 1,
        lastRevisionNumber: 1,
        remix_source_asset_id: null,
        remixSourceAssetId: null,
        created_at: new Date(),
        updated_at: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        type: {
            id: typeId,
            code: 'social-post',
            name: 'Social Post',
        },
        revisions: [
            {
                id: baseRevisionId,
                asset_id: baseAssetId,
                revision_number: 1,
                revisionNumber: 1,
                title: 'Coaching - Foundation Batch 2026',
                description: 'Master template',
                metadata: sampleDoc,
                status: 'PUBLISHED',
                created_by_id: userId,
                created_at: new Date(),
                files: [
                    {
                        id: 'file-1',
                        role: 'PRIMARY_ENTRY',
                        file_name: '1.jpg',
                        fileName: '1.jpg',
                        storage_key: 'templates/social-media/coaching/1.jpg',
                        storageKey: 'templates/social-media/coaching/1.jpg',
                    },
                ],
            },
        ],
    };
    let mockPrisma;
    let mockChain;
    let service;
    beforeEach(() => {
        mockChain = {
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockBaseAsset, error: null }),
        };
        mockChain.then = (resolve) => resolve({ data: [mockBaseAsset], error: null });
        mockPrisma = {
            asset: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            assetRevision: {
                create: jest.fn(),
            },
            assetUsage: {
                create: jest.fn(),
            },
            $queryRaw: jest.fn().mockResolvedValue([
                {
                    res: {
                        revision_id: 'rev-controlled-1',
                        revision_number: 1,
                        status: 'DRAFT',
                    },
                },
            ]),
            $transaction: jest.fn(async (callback) => callback(mockPrisma)),
            from: jest.fn().mockReturnValue(mockChain),
            rpc: jest.fn().mockResolvedValue({
                data: {
                    asset_id: 'cust-uuid-123',
                    slug: 'design-cust123',
                    revision_id: 'rev-controlled-1',
                    revision_number: 1,
                    title: 'Custom Title',
                    status: 'DRAFT',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                error: null,
            }),
            _chain: mockChain,
        };
        service = new database_template_service_1.DatabaseTemplateService(mockPrisma);
    });
    describe('1. Base Template Retrieval from assets_templatedhub', () => {
        it('queries published base templates from database via PostgREST', async () => {
            mockChain.then = (resolve) => resolve({ data: [mockBaseAsset], error: null });
            const templates = await service.listTemplates('Coaching');
            expect(mockPrisma.from).toHaveBeenCalledWith('assets_templatedhub');
            expect(templates.length).toBe(1);
            expect(templates[0].id).toBe(baseAssetId);
            expect(templates[0].title).toBe('Coaching - Foundation Batch 2026');
            expect(templates[0].classification).toBe('FLAT_IMAGE');
        });
        it('queries single base template by ID via PostgREST', async () => {
            mockChain.maybeSingle.mockResolvedValue({ data: mockBaseAsset, error: null });
            const template = await service.getTemplateById(baseAssetId);
            expect(mockPrisma.from).toHaveBeenCalledWith('assets_templatedhub');
            expect(template).toBeDefined();
            expect(template?.id).toBe(baseAssetId);
            expect(template?.document?.documentVersion).toBe(1);
        });
    });
    describe('2. Customization Persistence (Independent Copy Creation & Lineage)', () => {
        it('atomically creates an independent user copy with remix provenance via Supabase RPC', async () => {
            mockPrisma.rpc.mockResolvedValue({
                data: {
                    asset_id: 'cust-uuid-123',
                    slug: 'design-cust123',
                    revision_id: 'new-rev-1',
                    revision_number: 1,
                    title: 'My Custom Coaching Post',
                    status: 'DRAFT',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                error: null,
            });
            const customization = await service.customizeTemplate(baseAssetId, userId, 'My Custom Coaching Post');
            // Verify create_customization RPC usage
            expect(mockPrisma.rpc).toHaveBeenCalledWith('create_customization', expect.objectContaining({
                p_source_asset_id: baseAssetId,
                p_source_revision_id: baseRevisionId,
                p_creator_id: userId,
                p_title: 'My Custom Coaching Post',
            }));
            // Verify no direct Prisma mutations occurred in migrated path
            expect(mockPrisma.asset.create).not.toHaveBeenCalled();
            expect(mockPrisma.assetRevision.create).not.toHaveBeenCalled();
            expect(mockPrisma.$transaction).not.toHaveBeenCalled();
            expect(customization.title).toBe('My Custom Coaching Post');
            expect(customization.sourceTemplateId).toBe(baseAssetId);
            expect(customization.ownerId).toBe(userId);
        });
    });
    describe('3. Customization Revision Persistence & Ownership Guard', () => {
        it('creates revision N+1 on save via controlled RPC allocation', async () => {
            const mockCustomAsset = {
                id: 'cust-uuid-123',
                slug: 'design-cust123',
                creator_id: userId,
                creatorId: userId,
                status: 'DRAFT',
                last_revision_number: 1,
                lastRevisionNumber: 1,
                remix_source_asset_id: baseAssetId,
                remixSourceAssetId: baseAssetId,
                remix_source_revision_id: baseRevisionId,
                remixSourceRevisionId: baseRevisionId,
                created_at: new Date(),
                updated_at: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                revisions: [{ id: 'rev-1', revision_number: 1, revisionNumber: 1, title: 'Draft v1', metadata: sampleDoc }],
                remix_source_asset: mockBaseAsset,
                remixSourceAsset: mockBaseAsset,
            };
            mockChain.maybeSingle.mockResolvedValue({ data: mockCustomAsset, error: null });
            mockPrisma.rpc.mockResolvedValue({
                data: {
                    asset_id: 'cust-uuid-123',
                    slug: 'design-cust123',
                    revision_id: 'rev-2',
                    revision_number: 2,
                    title: 'Draft v2 Polish',
                    status: 'DRAFT',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                error: null,
            });
            const updatedDoc = {
                ...sampleDoc,
                elements: [{ ...sampleDoc.elements[0], text: 'Updated Content' }],
            };
            const result = await service.saveCustomization('cust-uuid-123', userId, 'CONTRIBUTOR', { title: 'Draft v2 Polish', document: updatedDoc });
            expect(mockPrisma.rpc).toHaveBeenCalledWith('save_customization_revision', expect.objectContaining({
                p_asset_id: 'cust-uuid-123',
                p_actor_id: userId,
                p_title: 'Draft v2 Polish',
            }));
            expect(result.revisionId).toBe('rev-2');
            expect(result.revisionNumber).toBe(2);
        });
        it('uses controlled revision allocation (save_customization_revision) via RPC', async () => {
            const mockCustomAsset = {
                id: 'cust-uuid-123',
                slug: 'design-cust123',
                creator_id: userId,
                creatorId: userId,
                status: 'DRAFT',
                last_revision_number: 1,
                lastRevisionNumber: 1,
                remix_source_asset_id: baseAssetId,
                remixSourceAssetId: baseAssetId,
                remix_source_revision_id: baseRevisionId,
                remixSourceRevisionId: baseRevisionId,
                created_at: new Date(),
                updated_at: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                revisions: [{ id: 'rev-1', revision_number: 1, revisionNumber: 1, title: 'Draft v1', metadata: sampleDoc }],
                remix_source_asset: mockBaseAsset,
                remixSourceAsset: mockBaseAsset,
            };
            mockChain.maybeSingle.mockResolvedValue({ data: mockCustomAsset, error: null });
            mockPrisma.rpc.mockResolvedValue({
                data: {
                    asset_id: 'cust-uuid-123',
                    slug: 'design-cust123',
                    revision_id: 'rev-controlled-2',
                    revision_number: 2,
                    title: 'Controlled Title',
                    status: 'DRAFT',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                error: null,
            });
            const result = await service.saveCustomization('cust-uuid-123', userId, 'CONTRIBUTOR', { title: 'Controlled Title', document: sampleDoc });
            expect(mockPrisma.rpc).toHaveBeenCalledWith('save_customization_revision', expect.objectContaining({
                p_asset_id: 'cust-uuid-123',
                p_actor_id: userId,
                p_title: 'Controlled Title',
            }));
            expect(result.revisionId).toBe('rev-controlled-2');
            expect(result.revisionNumber).toBe(2);
        });
        it('rejects unauthorized users from editing another contributor’s design', async () => {
            const mockCustomAsset = {
                id: 'cust-uuid-123',
                creator_id: userId, // Owned by userId
                creatorId: userId,
                remix_source_asset_id: baseAssetId,
                remixSourceAssetId: baseAssetId,
                revisions: [{ id: 'rev-1', revision_number: 1, revisionNumber: 1 }],
            };
            mockChain.maybeSingle.mockResolvedValue({ data: mockCustomAsset, error: null });
            await expect(service.saveCustomization('cust-uuid-123', otherUserId, // Attempted by other contributor
            'CONTRIBUTOR', { document: sampleDoc })).rejects.toThrow('Forbidden: You can only edit your own private designs.');
        });
        it('rejects non-owner ADMIN from viewing contributor private customization (Phase 4F rule)', async () => {
            const mockCustomAsset = {
                id: 'cust-uuid-123',
                slug: 'design-cust123',
                creator_id: userId,
                creatorId: userId,
                remix_source_asset_id: baseAssetId,
                remixSourceAssetId: baseAssetId,
                created_at: new Date(),
                updated_at: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                revisions: [{ id: 'rev-1', revision_number: 1, revisionNumber: 1, title: 'Draft', metadata: sampleDoc }],
                remix_source_asset: mockBaseAsset,
                remixSourceAsset: mockBaseAsset,
            };
            mockChain.maybeSingle.mockResolvedValue({ data: mockCustomAsset, error: null });
            await expect(service.getCustomizationById('cust-uuid-123', 'admin-user-id', 'ADMIN')).rejects.toThrow('Forbidden: You do not have permission to view this private design.');
        });
    });
    describe('4. Export Telemetry Logging', () => {
        it('records DOWNLOAD event in asset_usages_templatedhub', async () => {
            await service.logExport('cust-uuid-123', userId);
            expect(mockPrisma.from).toHaveBeenCalledWith('asset_usages_templatedhub');
            expect(mockChain.insert).toHaveBeenCalledWith({
                asset_id: 'cust-uuid-123',
                revision_id: null,
                user_id: userId,
                action: 'DOWNLOAD',
            });
        });
    });
});
