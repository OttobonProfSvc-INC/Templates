"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const system_actor_1 = require("../infrastructure/system-actor");
const supabaseClientModule = __importStar(require("../infrastructure/supabase/client"));
const env_1 = require("../config/env");
const customization_repository_1 = require("../modules/customizations/customization.repository");
const asset_repository_1 = require("../modules/assets/asset.repository");
const review_repository_1 = require("../modules/reviews/review.repository");
const errors_1 = require("../common/errors");
describe('Final Runtime Database Migration: sBLOOM Organization Mode', () => {
    let getSupabaseSpy;
    let createSupabaseSpy;
    beforeEach(() => {
        jest.clearAllMocks();
        getSupabaseSpy = jest.spyOn(supabaseClientModule, 'getSupabaseServerClient');
        createSupabaseSpy = jest.spyOn(supabaseClientModule, 'createSupabaseServerClient');
    });
    afterEach(() => {
        getSupabaseSpy.mockRestore();
        createSupabaseSpy.mockRestore();
    });
    // =========================================================================
    // 1. SystemActorService resolves via direct PostgreSQL
    // =========================================================================
    describe('1. SystemActorService resolves via direct PostgreSQL', () => {
        it('queries users_templatedhub directly via database client with role=ADMIN, isActive=true, created_at ASC', async () => {
            const mockDbClient = {
                user: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: '99999999-9999-4999-8999-999999999999',
                        email: 'admin@sbloom.internal',
                        role: 'ADMIN',
                        isActive: true,
                        createdAt: new Date('2026-01-01T00:00:00Z'),
                    }),
                },
            };
            const customService = new system_actor_1.SystemActorService(mockDbClient);
            const actor = await customService.getSystemActor();
            expect(mockDbClient.user.findFirst).toHaveBeenCalledWith({
                where: {
                    role: 'ADMIN',
                    isActive: true,
                },
                orderBy: {
                    createdAt: 'asc',
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isActive: true,
                },
            });
            expect(actor.id).toBe('99999999-9999-4999-8999-999999999999');
            expect(actor.role).toBe('ADMIN');
            expect(actor.isActive).toBe(true);
            // Verify that neither getSupabaseServerClient nor createSupabaseServerClient was invoked
            expect(getSupabaseSpy).not.toHaveBeenCalled();
            expect(createSupabaseSpy).not.toHaveBeenCalled();
        });
        it('caches authoritative actor only after successful resolution and does not re-query on second call', async () => {
            const mockDbClient = {
                user: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: '88888888-8888-4888-8888-888888888888',
                        email: 'admin2@sbloom.internal',
                        role: 'ADMIN',
                        isActive: true,
                    }),
                },
            };
            const customService = new system_actor_1.SystemActorService(mockDbClient);
            const actor1 = await customService.getSystemActor();
            const actor2 = await customService.getSystemActor();
            expect(actor1.id).toBe('88888888-8888-4888-8888-888888888888');
            expect(actor2.id).toBe('88888888-8888-4888-8888-888888888888');
            expect(mockDbClient.user.findFirst).toHaveBeenCalledTimes(1);
        });
    });
    // =========================================================================
    // 2. GET /api/templates does not initialize Supabase server client
    // =========================================================================
    describe('2. GET /api/templates does not initialize Supabase server client', () => {
        it('executes normal runtime template list without calling getSupabaseServerClient', async () => {
            const res = await (0, supertest_1.default)(app_1.default).get('/api/templates');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(getSupabaseSpy).not.toHaveBeenCalled();
            expect(createSupabaseSpy).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // 3. GET /api/workspace does not initialize Supabase server client
    // =========================================================================
    describe('3. GET /api/workspace does not initialize Supabase server client', () => {
        it('executes organization-shared workspace list without calling getSupabaseServerClient', async () => {
            const res = await (0, supertest_1.default)(app_1.default).get('/api/workspace');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            const resMyWork = await (0, supertest_1.default)(app_1.default).get('/api/my-work');
            expect(resMyWork.status).toBe(200);
            expect(Array.isArray(resMyWork.body)).toBe(true);
            expect(getSupabaseSpy).not.toHaveBeenCalled();
            expect(createSupabaseSpy).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // 4. GET /api/customizations/:id does not initialize Supabase server client
    // =========================================================================
    describe('4. GET /api/customizations/:id does not initialize Supabase server client', () => {
        it('retrieves customization detail without calling getSupabaseServerClient', async () => {
            // First create a customization
            const createRes = await (0, supertest_1.default)(app_1.default)
                .post('/api/templates/tmpl-schools-1/customize')
                .send({ title: 'Test Cust For Detail' });
            expect(createRes.status).toBe(201);
            const custId = createRes.body.id;
            // Clear spy call counts from create
            getSupabaseSpy.mockClear();
            createSupabaseSpy.mockClear();
            // Fetch customization detail
            const res = await (0, supertest_1.default)(app_1.default).get(`/api/customizations/${custId}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(custId);
            expect(getSupabaseSpy).not.toHaveBeenCalled();
            expect(createSupabaseSpy).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // 5. PUT /api/customizations/:id does not initialize Supabase server client
    // =========================================================================
    describe('5. PUT /api/customizations/:id does not initialize Supabase server client', () => {
        it('updates customization detail without calling getSupabaseServerClient', async () => {
            const createRes = await (0, supertest_1.default)(app_1.default)
                .post('/api/templates/tmpl-schools-1/customize')
                .send({ title: 'Test Cust For Update' });
            const custId = createRes.body.id;
            const initialDoc = createRes.body.document;
            getSupabaseSpy.mockClear();
            createSupabaseSpy.mockClear();
            const updateRes = await (0, supertest_1.default)(app_1.default)
                .put(`/api/customizations/${custId}`)
                .send({
                title: 'Updated Test Cust',
                document: initialDoc,
            });
            expect(updateRes.status).toBe(200);
            expect(updateRes.body.title).toBe('Updated Test Cust');
            expect(getSupabaseSpy).not.toHaveBeenCalled();
            expect(createSupabaseSpy).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // 6. POST /api/templates/:id/customize does not initialize Supabase server client
    // =========================================================================
    describe('6. POST /api/templates/:id/customize does not initialize Supabase server client', () => {
        it('customizes template without calling getSupabaseServerClient', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/templates/tmpl-schools-1/customize')
                .send({ title: 'Test Direct Customization' });
            expect(res.status).toBe(201);
            expect(res.body.title).toBe('Test Direct Customization');
            expect(res.body.id).toBeDefined();
            expect(getSupabaseSpy).not.toHaveBeenCalled();
            expect(createSupabaseSpy).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // 7. Missing SUPABASE_SERVICE_ROLE_KEY does not affect normal runtime
    // =========================================================================
    describe('7. Missing SUPABASE_SERVICE_ROLE_KEY does not affect normal runtime', () => {
        const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const originalConfigKey = env_1.config.supabaseServiceRoleKey;
        afterEach(() => {
            process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
            env_1.config.supabaseServiceRoleKey = originalConfigKey;
        });
        it('runs normal application routes and repositories when SUPABASE_SERVICE_ROLE_KEY is absent', async () => {
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            env_1.config.supabaseServiceRoleKey = '';
            // 1. Template listing
            const resTmpl = await (0, supertest_1.default)(app_1.default).get('/api/templates');
            expect(resTmpl.status).toBe(200);
            // 2. Workspace listing
            const resWork = await (0, supertest_1.default)(app_1.default).get('/api/workspace');
            expect(resWork.status).toBe(200);
            // 3. Customization creation
            const resCust = await (0, supertest_1.default)(app_1.default)
                .post('/api/templates/tmpl-schools-1/customize')
                .send({ title: 'No Service Role Key Cust' });
            expect(resCust.status).toBe(201);
            // Verify no Supabase calls were attempted
            expect(getSupabaseSpy).not.toHaveBeenCalled();
            expect(createSupabaseSpy).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // 8. Missing SUPABASE_SECRET_KEY does not affect normal runtime
    // =========================================================================
    describe('8. Missing SUPABASE_SECRET_KEY does not affect normal runtime', () => {
        const originalSecretKey = process.env.SUPABASE_SECRET_KEY;
        const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const originalConfigKey = env_1.config.supabaseServiceRoleKey;
        afterEach(() => {
            process.env.SUPABASE_SECRET_KEY = originalSecretKey;
            process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
            env_1.config.supabaseServiceRoleKey = originalConfigKey;
        });
        it('runs normal application routes and repositories when both SUPABASE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY are absent', async () => {
            delete process.env.SUPABASE_SECRET_KEY;
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            env_1.config.supabaseServiceRoleKey = '';
            const resTmpl = await (0, supertest_1.default)(app_1.default).get('/api/templates');
            expect(resTmpl.status).toBe(200);
            const resWork = await (0, supertest_1.default)(app_1.default).get('/api/workspace');
            expect(resWork.status).toBe(200);
            expect(getSupabaseSpy).not.toHaveBeenCalled();
            expect(createSupabaseSpy).not.toHaveBeenCalled();
        });
    });
    // =========================================================================
    // 9. No active ADMIN system actor produces a controlled system error
    // =========================================================================
    describe('9. No active ADMIN system actor produces a controlled system error', () => {
        it('throws ServiceUnavailableError (SYSTEM_ACTOR_UNAVAILABLE) when no active admin exists in DB', async () => {
            const mockEmptyDbClient = {
                user: {
                    findFirst: jest.fn().mockResolvedValue(null),
                },
            };
            const isolatedService = new system_actor_1.SystemActorService(mockEmptyDbClient);
            await expect(isolatedService.getSystemActor()).rejects.toThrow(errors_1.ServiceUnavailableError);
            try {
                await isolatedService.getSystemActor();
            }
            catch (err) {
                expect(err.code).toBe('SYSTEM_ACTOR_UNAVAILABLE');
                expect(err.httpStatus).toBe(503);
                expect(err.message).toContain('No active organization system actor found in database');
            }
        });
        it('does not cache failure when no admin was found', async () => {
            const mockDbClient = {
                user: {
                    findFirst: jest
                        .fn()
                        .mockResolvedValueOnce(null)
                        .mockResolvedValueOnce({
                        id: '77777777-7777-4777-8777-777777777777',
                        email: 'recovered-admin@sbloom.internal',
                        role: 'ADMIN',
                        isActive: true,
                    }),
                },
            };
            const isolatedService = new system_actor_1.SystemActorService(mockDbClient);
            await expect(isolatedService.getSystemActor()).rejects.toThrow(errors_1.ServiceUnavailableError);
            // On second try (e.g. after recovery), it resolves and caches
            const recovered = await isolatedService.getSystemActor();
            expect(recovered.id).toBe('77777777-7777-4777-8777-777777777777');
        });
    });
    // =========================================================================
    // 10. Existing lifecycle/customization transaction behavior remains atomic
    // =========================================================================
    describe('10. Existing lifecycle/customization transaction behavior remains atomic', () => {
        it('ReviewRepository invokes submit_draft_revision and record_review_decision via direct PostgreSQL $queryRaw', async () => {
            const mockDb = {
                $queryRaw: jest.fn().mockImplementation((strings) => {
                    const sql = strings.join('');
                    if (sql.includes('submit_draft_revision')) {
                        return Promise.resolve([{
                                result: {
                                    revision_id: 'rev-1',
                                    status: 'IN_REVIEW',
                                },
                            }]);
                    }
                    if (sql.includes('record_review_decision')) {
                        return Promise.resolve([{
                                result: {
                                    review_id: 'rev-rec-1',
                                    revision_id: 'rev-1',
                                    asset_id: 'asset-1',
                                    status: 'APPROVED',
                                    decision: 'APPROVE',
                                },
                            }]);
                    }
                    return Promise.resolve([]);
                }),
            };
            const repo = new review_repository_1.ReviewRepository(mockDb);
            const submitRes = await repo.submitDraftRevision('rev-1');
            expect(submitRes.status).toBe('IN_REVIEW');
            expect(mockDb.$queryRaw).toHaveBeenCalled();
            const decisionRes = await repo.recordDecision({
                revisionId: 'rev-1',
                reviewerId: 'reviewer-1',
                decision: 'APPROVE',
                comments: 'Looks good',
            });
            expect(decisionRes.decision).toBe('APPROVE');
            expect(mockDb.$queryRaw).toHaveBeenCalledTimes(2);
            expect(getSupabaseSpy).not.toHaveBeenCalled();
        });
        it('AssetRepository invokes publish_asset_revision, archive_asset, unarchive_asset, delete_draft_revision via direct PostgreSQL $queryRaw', async () => {
            const mockDb = {
                $queryRaw: jest.fn().mockImplementation((strings) => {
                    const sql = strings.join('');
                    if (sql.includes('publish_asset_revision')) {
                        return Promise.resolve([{
                                result: {
                                    asset_id: 'asset-1',
                                    published_revision_id: 'rev-1',
                                    superseded_revision_id: null,
                                },
                            }]);
                    }
                    if (sql.includes('unarchive_asset')) {
                        return Promise.resolve([{
                                result: {
                                    asset_id: 'asset-1',
                                    status: 'PUBLISHED',
                                    previous_status: 'ARCHIVED',
                                },
                            }]);
                    }
                    if (sql.includes('public.archive_asset(')) {
                        return Promise.resolve([{
                                result: {
                                    asset_id: 'asset-1',
                                    status: 'ARCHIVED',
                                    previous_status: 'PUBLISHED',
                                },
                            }]);
                    }
                    if (sql.includes('delete_draft_revision')) {
                        return Promise.resolve([{
                                result: {
                                    asset_id: 'asset-1',
                                    revision_id: 'rev-1',
                                    revision_number: 2,
                                    deleted_file_count: 0,
                                    status: 'DELETED',
                                },
                            }]);
                    }
                    return Promise.resolve([]);
                }),
            };
            const repo = new asset_repository_1.AssetRepository(mockDb);
            const pub = await repo.publishRevision({ assetId: 'asset-1', revisionId: 'rev-1' });
            expect(pub.publishedRevisionId).toBe('rev-1');
            const arch = await repo.archiveAsset({ assetId: 'asset-1', actorId: 'actor-1' });
            expect(arch.status).toBe('ARCHIVED');
            const unarch = await repo.unarchiveAsset({ assetId: 'asset-1', actorId: 'actor-1' });
            expect(unarch.status).toBe('PUBLISHED');
            const del = await repo.deleteDraftRevision({ revisionId: 'rev-1', actorId: 'actor-1' });
            expect(del.revisionId).toBe('rev-1');
            expect(mockDb.$queryRaw).toHaveBeenCalledTimes(4);
            expect(getSupabaseSpy).not.toHaveBeenCalled();
        });
        it('CustomizationRepository invokes create_customization, save_customization_revision, allocate_next_revision via direct PostgreSQL $queryRaw', async () => {
            const mockDb = {
                $queryRaw: jest.fn().mockImplementation((strings) => {
                    const sql = strings.join('');
                    if (sql.includes('create_customization')) {
                        return Promise.resolve([{
                                result: {
                                    asset_id: 'cust-1',
                                    slug: 'cust-slug-1',
                                    revision_id: 'rev-1',
                                    revision_number: 1,
                                    title: 'Remixed Post',
                                    status: 'DRAFT',
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                },
                            }]);
                    }
                    if (sql.includes('save_customization_revision')) {
                        return Promise.resolve([{
                                result: {
                                    asset_id: 'cust-1',
                                    slug: 'cust-slug-1',
                                    revision_id: 'rev-2',
                                    revision_number: 2,
                                    title: 'Updated Post',
                                    status: 'DRAFT',
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                },
                            }]);
                    }
                    if (sql.includes('allocate_next_revision')) {
                        return Promise.resolve([{
                                result: {
                                    revision_id: 'rev-3',
                                    revision_number: 3,
                                    status: 'DRAFT',
                                },
                            }]);
                    }
                    return Promise.resolve([]);
                }),
            };
            const repo = new customization_repository_1.CustomizationRepository(mockDb);
            const createRes = await repo.createCustomizationWithRevision({
                id: 'cust-1',
                slug: 'cust-slug-1',
                sourceAssetId: 'tmpl-1',
                sourceRevisionId: 'rev-tmpl-1',
                title: 'Remixed Post',
                creatorId: 'actor-1',
                metadata: {},
            });
            expect(createRes.asset.id).toBe('cust-1');
            const saveRes = await repo.saveCustomizationRevision({
                assetId: 'cust-1',
                actorId: 'actor-1',
                title: 'Updated Post',
                metadata: {},
            });
            expect(saveRes.asset.id).toBe('cust-1');
            const nextRev = await repo.allocateNextRevision({
                assetId: 'cust-1',
                title: 'Rev 3',
                metadata: {},
            });
            expect(nextRev.revisionNumber).toBe(3);
            expect(mockDb.$queryRaw).toHaveBeenCalledTimes(3);
            expect(getSupabaseSpy).not.toHaveBeenCalled();
        });
    });
});
