"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const customization_repository_1 = require("../modules/customizations/customization.repository");
const customization_service_1 = require("../modules/customizations/customization.service");
const errors_1 = require("../common/errors");
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
describe('API-5B: Customization Supabase RPC Migration & Security', () => {
    let mockInjectedClient;
    beforeEach(() => {
        jest.clearAllMocks();
        mockInjectedClient = {
            from: jest.fn(),
            rpc: jest.fn(),
            asset: { create: jest.fn() },
            assetUsage: { create: jest.fn() },
            $transaction: jest.fn(),
        };
    });
    // =========================================================================
    // TASK 22 — STATIC SQL SECURITY TESTS
    // =========================================================================
    describe('Task 22: Static SQL Security Inspection (05_add_customization_rpc_functions.sql)', () => {
        const patchPath = path_1.default.resolve(__dirname, '../../../../packages/database/supabase/05_add_customization_rpc_functions.sql');
        let sqlContent;
        beforeAll(() => {
            expect(fs_1.default.existsSync(patchPath)).toBe(true);
            sqlContent = fs_1.default.readFileSync(patchPath, 'utf-8');
        });
        it('1. Contains both exact function names', () => {
            expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.create_customization(');
            expect(sqlContent).toContain('CREATE OR REPLACE FUNCTION public.save_customization_revision(');
        });
        it('2. Enforces SECURITY DEFINER on both functions', () => {
            const createMatches = sqlContent.match(/create_customization[\s\S]*?SECURITY DEFINER/g);
            expect(createMatches).not.toBeNull();
            expect(createMatches.length).toBeGreaterThan(0);
            const saveMatches = sqlContent.match(/save_customization_revision[\s\S]*?SECURITY DEFINER/g);
            expect(saveMatches).not.toBeNull();
            expect(saveMatches.length).toBeGreaterThan(0);
        });
        it('3. Enforces safe search_path = pg_catalog, public, pg_temp', () => {
            const searchPathMatches = sqlContent.match(/SET search_path = pg_catalog, public, pg_temp/g);
            expect(searchPathMatches).not.toBeNull();
            expect(searchPathMatches.length).toBe(2);
        });
        it('4. Explicitly transfers ownership to sbloom_owner', () => {
            expect(sqlContent).toContain('ALTER FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) OWNER TO sbloom_owner;');
            expect(sqlContent).toContain('ALTER FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) OWNER TO sbloom_owner;');
        });
        it('5. Revokes execution from PUBLIC, anon, and authenticated', () => {
            expect(sqlContent).toContain('REVOKE ALL ON FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) FROM PUBLIC;');
            expect(sqlContent).toContain('REVOKE ALL ON FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) FROM PUBLIC;');
            expect(sqlContent).toContain('REVOKE ALL ON FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) FROM anon;');
            expect(sqlContent).toContain('REVOKE ALL ON FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) FROM anon;');
            expect(sqlContent).toContain('REVOKE ALL ON FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) FROM authenticated;');
            expect(sqlContent).toContain('REVOKE ALL ON FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) FROM authenticated;');
        });
        it('6. Grants EXECUTE strictly to sbloom_app runtime role', () => {
            expect(sqlContent).toContain('GRANT EXECUTE ON FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) TO sbloom_app;');
            expect(sqlContent).toContain('GRANT EXECUTE ON FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) TO sbloom_app;');
        });
        it('7. Contains NO grant to sbloom_admin or sbloom_owner for service_role', () => {
            expect(sqlContent).not.toMatch(/GRANT.*TO.*sbloom_admin/i);
            expect(sqlContent).not.toMatch(/GRANT.*sbloom_owner.*TO/i);
        });
        it('8. Contains NO direct table INSERT grants on asset_revisions_templatedhub', () => {
            expect(sqlContent).not.toMatch(/GRANT.*INSERT.*ON.*asset_revisions_templatedhub/i);
        });
        it('9. Contains NO destructive DROP, CASCADE, or schema-wide privilege changes', () => {
            const nonCommentSql = sqlContent
                .split('\n')
                .filter((line) => !line.trim().startsWith('--'))
                .join('\n');
            expect(nonCommentSql).not.toMatch(/\bDROP\s+TABLE\b/i);
            expect(nonCommentSql).not.toMatch(/\bDROP\s+SCHEMA\b/i);
            expect(nonCommentSql).not.toMatch(/\bCASCADE\b/i);
            expect(nonCommentSql).not.toMatch(/GRANT ALL ON ALL/i);
            expect(nonCommentSql).not.toMatch(/REVOKE ALL ON ALL/i);
        });
        it('10. Appends schema cache reload notification', () => {
            expect(sqlContent).toContain("NOTIFY pgrst, 'reload schema';");
        });
    });
    // =========================================================================
    // TASK 23 — TEST create_customization RPC GATEWAY
    // =========================================================================
    describe('Task 23: create_customization RPC Gateway', () => {
        const validParams = {
            id: 'a0000000-0000-0000-0000-000000000001',
            slug: 'design-a0000000',
            typeId: 'type-should-be-omitted',
            creatorId: 'c0000000-0000-0000-0000-000000000002',
            sourceAssetId: 's0000000-0000-0000-0000-000000000003',
            sourceRevisionId: 'r0000000-0000-0000-0000-000000000004',
            title: 'Remixed Template',
            metadata: { elements: [] },
        };
        const validRpcResponse = {
            asset_id: 'a0000000-0000-0000-0000-000000000001',
            slug: 'design-a0000000',
            revision_id: 'rev-alloc-1',
            revision_number: 1,
            title: 'Remixed Template',
            status: 'DRAFT',
            created_at: '2026-03-30T10:00:00.000Z',
            updated_at: '2026-03-30T10:00:00.000Z',
        };
        it('1. Calls exact RPC name create_customization with exact payload keys and NO p_type_id', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: validRpcResponse,
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await repo.createCustomizationWithRevision(validParams);
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('create_customization', {
                p_customization_id: validParams.id,
                p_slug: validParams.slug,
                p_creator_id: validParams.creatorId,
                p_source_asset_id: validParams.sourceAssetId,
                p_source_revision_id: validParams.sourceRevisionId,
                p_title: validParams.title,
                p_metadata: validParams.metadata,
                p_schema_version: 1,
            });
            // Assert p_type_id was strictly omitted
            const callArgs = mockInjectedClient.rpc.mock.calls[0][1];
            expect(callArgs).not.toHaveProperty('p_type_id');
            expect(callArgs).not.toHaveProperty('typeId');
        });
        it('2. Maps domain response with valid Date instances and integer revision number', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: validRpcResponse,
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            const res = await repo.createCustomizationWithRevision(validParams);
            expect(res).toEqual({
                asset: {
                    id: 'a0000000-0000-0000-0000-000000000001',
                    slug: 'design-a0000000',
                    createdAt: new Date('2026-03-30T10:00:00.000Z'),
                    updatedAt: new Date('2026-03-30T10:00:00.000Z'),
                },
                revision: {
                    id: 'rev-alloc-1',
                    revisionNumber: 1,
                    title: 'Remixed Template',
                    status: 'DRAFT',
                },
            });
            expect(Number.isInteger(res.revision.revisionNumber)).toBe(true);
            expect(res.asset.createdAt instanceof Date).toBe(true);
            expect(res.asset.updatedAt instanceof Date).toBe(true);
        });
        it('3. Supports defensive array response from PostgREST', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: [validRpcResponse],
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            const res = await repo.createCustomizationWithRevision(validParams);
            expect(res.asset.id).toBe('a0000000-0000-0000-0000-000000000001');
            expect(res.revision.revisionNumber).toBe(1);
        });
        it('4. Rejects malformed / null response with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({ data: null, error: null });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.InternalError);
        });
        it('5. Rejects non-integer revision_number with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { ...validRpcResponse, revision_number: '1' }, // string instead of integer
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.InternalError);
        });
        it('6. Rejects invalid timestamp string with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: { ...validRpcResponse, created_at: 'invalid-date' },
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.InternalError);
        });
        it('7. Maps "Source template ... does not exist" to NotFoundError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Source template s0000000-0000-0000-0000-000000000003 does not exist' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.NotFoundError);
        });
        it('8. Maps "Source asset ... is a remix" to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Source asset s0000000-0000-0000-0000-000000000003 is a remix, cannot remix a remix' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ConflictError);
        });
        it('9. Maps "Source template ... is not published" to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Source template s0000000-0000-0000-0000-000000000003 is not published (status: DRAFT)' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ConflictError);
        });
        it('10. Maps "Source revision ... does not exist" to NotFoundError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Source revision r0000000-0000-0000-0000-000000000004 does not exist' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.NotFoundError);
        });
        it('11. Maps "Source revision ... does not belong to asset" to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Source revision r0000000-0000-0000-0000-000000000004 does not belong to source asset' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ConflictError);
        });
        it('12. Maps "Source revision ... is not in PUBLISHED status" to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Source revision r0000000-0000-0000-0000-000000000004 is not in PUBLISHED status (status: DRAFT)' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ConflictError);
        });
        it('13. Maps "Source revision ... is not the current published revision" to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Source revision r0000000-0000-0000-0000-000000000004 is not the current published revision' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ConflictError);
        });
        it('14. Maps "Creator ... does not exist or is inactive" to ForbiddenError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Creator c0000000-0000-0000-0000-000000000002 does not exist or is inactive' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ForbiddenError);
        });
        it('15. Maps 23505 unique violation to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'duplicate key value violates unique constraint', code: '23505' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ConflictError);
        });
        it('16. Maps 23503 foreign key violation to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'insert or update on table violates foreign key constraint', code: '23503' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ConflictError);
        });
        it('17. Maps connection error codes 08006 / 57P01 to ServiceUnavailableError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'connection terminated', code: '57P01' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.createCustomizationWithRevision(validParams)).rejects.toThrow(errors_1.ServiceUnavailableError);
        });
        it('18. Sanitizes error messages so credentials are never leaked', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Connection failed: postgresql://sbloom_app:SUPER_SECRET_PWD@localhost:5432/db' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            try {
                await repo.createCustomizationWithRevision(validParams);
                fail('Should have thrown');
            }
            catch (err) {
                expect(err.message).not.toContain('SUPER_SECRET_PWD');
            }
        });
        it('19. Asserts NO direct asset.create or assetUsage.create is executed', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: validRpcResponse,
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await repo.createCustomizationWithRevision(validParams);
            expect(mockInjectedClient.asset.create).not.toHaveBeenCalled();
            expect(mockInjectedClient.assetUsage.create).not.toHaveBeenCalled();
            expect(mockInjectedClient.$transaction).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // TASK 24 — TEST save_customization_revision RPC GATEWAY
    // =========================================================================
    describe('Task 24: save_customization_revision RPC Gateway', () => {
        const validParams = {
            assetId: 'a0000000-0000-0000-0000-000000000001',
            actorId: 'c0000000-0000-0000-0000-000000000002',
            title: 'Updated Design V2',
            metadata: { elements: [{ id: '1', type: 'text' }] },
            schemaVersion: 1,
        };
        const validRpcResponse = {
            asset_id: 'a0000000-0000-0000-0000-000000000001',
            slug: 'design-a0000000',
            revision_id: 'rev-alloc-2',
            revision_number: 2,
            title: 'Updated Design V2',
            status: 'DRAFT',
            created_at: '2026-03-30T10:00:00.000Z',
            updated_at: '2026-03-30T11:00:00.000Z',
        };
        it('1. Calls exact RPC name save_customization_revision with exact payload keys', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: validRpcResponse,
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await repo.saveCustomizationRevision(validParams);
            expect(mockInjectedClient.rpc).toHaveBeenCalledWith('save_customization_revision', {
                p_asset_id: validParams.assetId,
                p_actor_id: validParams.actorId,
                p_title: validParams.title,
                p_metadata: validParams.metadata,
                p_schema_version: 1,
            });
        });
        it('2. Maps domain response with valid Date instances and integer revision number', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: validRpcResponse,
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            const res = await repo.saveCustomizationRevision(validParams);
            expect(res).toEqual({
                asset: {
                    id: 'a0000000-0000-0000-0000-000000000001',
                    slug: 'design-a0000000',
                    createdAt: new Date('2026-03-30T10:00:00.000Z'),
                    updatedAt: new Date('2026-03-30T11:00:00.000Z'),
                },
                revision: {
                    id: 'rev-alloc-2',
                    revisionNumber: 2,
                    title: 'Updated Design V2',
                    status: 'DRAFT',
                },
            });
            expect(Number.isInteger(res.revision.revisionNumber)).toBe(true);
            expect(res.asset.createdAt instanceof Date).toBe(true);
            expect(res.asset.updatedAt instanceof Date).toBe(true);
        });
        it('3. Supports defensive array response from PostgREST', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: [validRpcResponse],
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            const res = await repo.saveCustomizationRevision(validParams);
            expect(res.asset.id).toBe('a0000000-0000-0000-0000-000000000001');
            expect(res.revision.revisionNumber).toBe(2);
        });
        it('4. Rejects malformed / null response with InternalError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({ data: null, error: null });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.saveCustomizationRevision(validParams)).rejects.toThrow(errors_1.InternalError);
        });
        it('5. Maps ownership violation to ForbiddenError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Access denied: User c0000000-0000-0000-0000-000000000002 is not the owner of customization a0000000-0000-0000-0000-000000000001' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.saveCustomizationRevision(validParams)).rejects.toThrow(errors_1.ForbiddenError);
        });
        it('6. Maps "Actor ... does not exist or is inactive" to ForbiddenError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Actor c0000000-0000-0000-0000-000000000002 does not exist or is inactive' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.saveCustomizationRevision(validParams)).rejects.toThrow(errors_1.ForbiddenError);
        });
        it('7. Maps non-customization target to ConflictError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Asset a0000000-0000-0000-0000-000000000001 is not a customization (remix_source_asset_id is null)' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.saveCustomizationRevision(validParams)).rejects.toThrow(errors_1.ConflictError);
        });
        it('8. Maps missing customization to NotFoundError', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: null,
                error: { message: 'Customization a0000000-0000-0000-0000-000000000001 does not exist' },
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await expect(repo.saveCustomizationRevision(validParams)).rejects.toThrow(errors_1.NotFoundError);
        });
        it('9. Asserts NO Prisma transaction is called', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: validRpcResponse,
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await repo.saveCustomizationRevision(validParams);
            expect(mockInjectedClient.$transaction).not.toHaveBeenCalled();
        });
        it('10. Asserts NO separate usage insert or second PostgREST read occurs', async () => {
            mockInjectedClient.rpc.mockResolvedValue({
                data: validRpcResponse,
                error: null,
            });
            const repo = new customization_repository_1.CustomizationRepository(mockInjectedClient);
            await repo.saveCustomizationRevision(validParams);
            expect(mockInjectedClient.from).not.toHaveBeenCalled();
            expect(mockInjectedClient.assetUsage.create).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // TASK 25 — SERVICE REGRESSION TESTS
    // =========================================================================
    describe('Task 25: CustomizationService Regression & Contract Preservation', () => {
        const sampleDoc = {
            documentVersion: 1,
            canvas: { width: 1080, height: 1080, backgroundColor: '#ffffff' },
            elements: [{ id: 'el-heading', type: 'text', name: 'Heading', text: 'Original Title' }],
        };
        let mockTemplateRepo;
        let mockCustomizationRepo;
        let service;
        beforeEach(() => {
            mockTemplateRepo = {
                findBaseTemplateForRemix: jest.fn().mockResolvedValue({
                    id: 'base-asset-1',
                    typeId: 'type-post',
                    revisions: [{ id: 'base-rev-1', title: 'Base Master Template', metadata: sampleDoc }],
                }),
            };
            mockCustomizationRepo = {
                createCustomizationWithRevision: jest.fn().mockImplementation(async (params) => ({
                    asset: {
                        id: params.id,
                        slug: params.slug,
                        createdAt: new Date('2026-03-30T10:00:00.000Z'),
                        updatedAt: new Date('2026-03-30T10:00:00.000Z'),
                    },
                    revision: {
                        id: 'rev-1',
                        revisionNumber: 1,
                        title: params.title,
                        status: 'DRAFT',
                    },
                })),
                saveCustomizationRevision: jest.fn().mockImplementation(async (params) => ({
                    asset: {
                        id: params.assetId,
                        slug: 'design-custom-1',
                        createdAt: new Date('2026-03-30T10:00:00.000Z'),
                        updatedAt: new Date('2026-03-30T11:00:00.000Z'),
                    },
                    revision: {
                        id: 'rev-2',
                        revisionNumber: 2,
                        title: params.title,
                        status: 'DRAFT',
                    },
                })),
                findCustomizationById: jest.fn().mockResolvedValue({
                    id: 'cust-1',
                    slug: 'design-custom-1',
                    creatorId: 'user-owner',
                    createdAt: new Date('2026-03-30T10:00:00.000Z'),
                    updatedAt: new Date('2026-03-30T10:00:00.000Z'),
                    remixSourceAssetId: 'base-asset-1',
                    remixSourceRevisionId: 'base-rev-1',
                    remixSourceAsset: {
                        revisions: [{ id: 'base-rev-1', title: 'Base Master Template' }],
                    },
                    revisions: [{ id: 'rev-1', revisionNumber: 1, title: 'Draft V1', metadata: sampleDoc }],
                }),
            };
            service = new customization_service_1.CustomizationService(undefined, mockTemplateRepo, mockCustomizationRepo);
        });
        it('1. customizeTemplate preserves exact CustomizationDto contract and deep clones document', async () => {
            const res = await service.customizeTemplate('base-asset-1', { id: 'user-owner', role: 'CONTRIBUTOR' }, 'My Brand New Design');
            expect(res).toEqual({
                id: expect.any(String),
                slug: expect.stringMatching(/^design-/),
                title: 'My Brand New Design',
                sourceTemplateId: 'base-asset-1',
                sourceRevisionId: 'base-rev-1',
                sourceTemplateTitle: 'Base Master Template',
                ownerId: 'user-owner',
                revisionId: 'rev-1',
                revisionNumber: 1,
                status: 'DRAFT',
                document: expect.objectContaining({ documentVersion: 1 }),
                thumbnailUrl: undefined,
                createdAt: '2026-03-30T10:00:00.000Z',
                updatedAt: '2026-03-30T10:00:00.000Z',
            });
            // Verify document was deep cloned (not reference equal)
            expect(res.document).not.toBe(sampleDoc);
            expect(res.document).toEqual(sampleDoc);
        });
        it('2. saveCustomization preserves exact CustomizationDto contract and owner security guard', async () => {
            const updateDoc = {
                documentVersion: 1,
                canvas: { width: 1080, height: 1080, backgroundColor: '#000000' },
                elements: [],
            };
            const res = await service.saveCustomization('cust-1', { id: 'user-owner', role: 'CONTRIBUTOR' }, { title: 'Draft V2', document: updateDoc });
            expect(res).toEqual({
                id: 'cust-1',
                slug: 'design-custom-1',
                title: 'Draft V2',
                sourceTemplateId: 'base-asset-1',
                sourceRevisionId: 'base-rev-1',
                sourceTemplateTitle: 'Base Master Template',
                ownerId: 'user-owner',
                revisionId: 'rev-2',
                revisionNumber: 2,
                status: 'DRAFT',
                document: updateDoc,
                brandKitId: null,
                brandKitName: null,
                thumbnailUrl: undefined,
                createdAt: '2026-03-30T10:00:00.000Z',
                updatedAt: '2026-03-30T11:00:00.000Z',
            });
            expect(mockCustomizationRepo.saveCustomizationRevision).toHaveBeenCalledTimes(1);
        });
        it('3. saveCustomization rejects non-owner CONTRIBUTOR and non-owner ADMIN with ForbiddenError (403)', async () => {
            // Contributor non-owner
            await expect(service.saveCustomization('cust-1', { id: 'user-other', role: 'CONTRIBUTOR' }, { document: sampleDoc })).rejects.toThrow(errors_1.ForbiddenError);
            // Admin non-owner (Zero admin bypass)
            await expect(service.saveCustomization('cust-1', { id: 'admin-other', role: 'ADMIN' }, { document: sampleDoc })).rejects.toThrow(errors_1.ForbiddenError);
            // Verify write RPC was NOT called when service ownership guard rejected
            expect(mockCustomizationRepo.saveCustomizationRevision).not.toHaveBeenCalled();
        });
        it('4. customizeTemplate throws NotFoundError if source template is missing', async () => {
            mockTemplateRepo.findBaseTemplateForRemix.mockResolvedValue(null);
            await expect(service.customizeTemplate('missing-template', { id: 'user-owner', role: 'CONTRIBUTOR' })).rejects.toThrow(errors_1.NotFoundError);
        });
        it('5. customizeTemplate throws ConflictError if base template has no published revision', async () => {
            mockTemplateRepo.findBaseTemplateForRemix.mockResolvedValue({
                id: 'base-asset-1',
                typeId: 'type-post',
                revisions: [],
            });
            await expect(service.customizeTemplate('base-asset-1', { id: 'user-owner', role: 'CONTRIBUTOR' })).rejects.toThrow(errors_1.ConflictError);
        });
    });
});
