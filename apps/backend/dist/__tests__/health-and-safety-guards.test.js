"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const health_routes_1 = require("../modules/health/health.routes");
const admin_routes_1 = require("../modules/admin/admin.routes");
const asset_routes_1 = require("../modules/assets/asset.routes");
const error_handler_1 = require("../middleware/error-handler");
const request_id_1 = require("../middleware/request-id");
describe('Phase 4I-18, 4I-19, 4I-20, 4I-22: Health, Production Safety & Guardrail Tests', () => {
    // =========================================================================
    // 4I-18: Health & Readiness Tests
    // =========================================================================
    describe('Health Probes (4I-18)', () => {
        let testApp;
        beforeEach(() => {
            testApp = (0, express_1.default)();
            testApp.use(request_id_1.requestIdMiddleware);
            testApp.use(health_routes_1.healthRouter);
            testApp.use(error_handler_1.errorHandler);
        });
        afterEach(() => {
            jest.restoreAllMocks();
            delete process.env.USE_DATABASE_STORAGE;
        });
        it('GET /health returns 200 with status ok and timestamp', async () => {
            const res = await (0, supertest_1.default)(testApp).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.timestamp).toBeDefined();
        });
        it('GET /health/live returns 200 with status ok, timestamp, and uptime', async () => {
            const res = await (0, supertest_1.default)(testApp).get('/health/live');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.uptime).toBeDefined();
            expect(typeof res.body.uptime).toBe('number');
        });
        it('GET /health/ready in development/test mode returns ok with in-memory status', async () => {
            const res = await (0, supertest_1.default)(testApp).get('/health/ready');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.database).toBe('in-memory');
        });
        it('GET /health/ready in DB mode returns 200 when database connectivity probe succeeds', async () => {
            let isolatedApp;
            const prev = process.env.USE_DATABASE_STORAGE;
            try {
                process.env.USE_DATABASE_STORAGE = 'true';
                jest.isolateModules(() => {
                    const { healthRouter: isolatedHealthRouter } = require('../modules/health/health.routes');
                    const isolatedDbModule = require('../config/database');
                    const { errorHandler: isolatedErrorHandler } = require('../middleware/error-handler');
                    const { requestIdMiddleware: isolatedReqId } = require('../middleware/request-id');
                    jest.spyOn(isolatedDbModule, 'verifyDatabaseConnection').mockResolvedValue({
                        connected: true,
                        latencyMs: 5,
                    });
                    isolatedApp = (0, express_1.default)();
                    isolatedApp.use(isolatedReqId);
                    isolatedApp.use(isolatedHealthRouter);
                    isolatedApp.use(isolatedErrorHandler);
                });
                const res = await (0, supertest_1.default)(isolatedApp).get('/health/ready');
                expect(res.status).toBe(200);
                expect(res.body.status).toBe('ok');
                expect(res.body.database).toBe('connected');
                expect(res.body.latencyMs).toBe(5);
            }
            finally {
                if (prev !== undefined)
                    process.env.USE_DATABASE_STORAGE = prev;
                else
                    delete process.env.USE_DATABASE_STORAGE;
            }
        });
        it('GET /health/ready in DB mode returns 503 degraded when database connectivity fails', async () => {
            let isolatedApp;
            const prev = process.env.USE_DATABASE_STORAGE;
            try {
                process.env.USE_DATABASE_STORAGE = 'true';
                jest.isolateModules(() => {
                    const { healthRouter: isolatedHealthRouter } = require('../modules/health/health.routes');
                    const isolatedDbModule = require('../config/database');
                    const { errorHandler: isolatedErrorHandler } = require('../middleware/error-handler');
                    const { requestIdMiddleware: isolatedReqId } = require('../middleware/request-id');
                    jest.spyOn(isolatedDbModule, 'verifyDatabaseConnection').mockResolvedValue({
                        connected: false,
                        latencyMs: 12,
                        error: 'Connection terminated',
                    });
                    isolatedApp = (0, express_1.default)();
                    isolatedApp.use(isolatedReqId);
                    isolatedApp.use(isolatedHealthRouter);
                    isolatedApp.use(isolatedErrorHandler);
                });
                const res = await (0, supertest_1.default)(isolatedApp).get('/health/ready');
                expect(res.status).toBe(503);
                expect(res.body.status).toBe('degraded');
                expect(res.body.database).toBe('disconnected');
            }
            finally {
                if (prev !== undefined)
                    process.env.USE_DATABASE_STORAGE = prev;
                else
                    delete process.env.USE_DATABASE_STORAGE;
            }
        });
    });
    // =========================================================================
    // 4I-19: Production Safety Guard Test
    // =========================================================================
    describe('Production Mode Persistence Guard (4I-19)', () => {
        it('verifies production mode fails fast if database storage is disabled or databaseUrl is missing', () => {
            const envPath = path_1.default.resolve(__dirname, '../config/env.ts');
            const envContent = fs_1.default.readFileSync(envPath, 'utf8');
            // Static code verification ensuring production mode enforces database persistence
            expect(envContent).toContain("if (nodeEnv === 'production')");
            expect(envContent).toContain('FATAL CONFIGURATION ERROR: Production mode requires database persistence');
            expect(envContent).toContain('USE_DATABASE_STORAGE=true');
            expect(envContent).toContain('DATABASE_URL');
        });
    });
    // =========================================================================
    // 4I-20: Deferred Route Exposure Safety Tests
    // =========================================================================
    describe('Deferred Route Safety (4I-20)', () => {
        let testApp;
        beforeEach(() => {
            testApp = (0, express_1.default)();
            testApp.use(request_id_1.requestIdMiddleware);
            testApp.use(express_1.default.json());
            testApp.use(admin_routes_1.adminRouter);
            testApp.use(asset_routes_1.assetRouter);
            testApp.use(error_handler_1.notFoundHandler);
            testApp.use(error_handler_1.errorHandler);
        });
        it('verifies submit revision has NO public route (returns 404 JSON)', async () => {
            const res = await (0, supertest_1.default)(testApp).post('/api/revisions/submit/rev-123');
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
        it('verifies publish asset has NO public route (returns 404 JSON)', async () => {
            const res = await (0, supertest_1.default)(testApp).post('/api/assets/asset-123/publish');
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
        it('verifies archive asset has NO public route (returns 404 JSON)', async () => {
            const res = await (0, supertest_1.default)(testApp).post('/api/assets/asset-123/archive');
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
        it('verifies unarchive asset has NO public route (returns 404 JSON)', async () => {
            const res = await (0, supertest_1.default)(testApp).post('/api/assets/asset-123/unarchive');
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
        it('verifies deleteDraftRevision has NO public route (returns 404 JSON)', async () => {
            const res = await (0, supertest_1.default)(testApp).delete('/api/revisions/rev-123');
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
    });
    // =========================================================================
    // 4I-22: No Direct Database Bypass Static Regression Tests
    // =========================================================================
    describe('No Direct Database Bypass Regression Invariants (4I-22)', () => {
        it('verifies no production domain service directly invokes assetRevision.create', () => {
            const modulesDir = path_1.default.resolve(__dirname, '../modules');
            const files = [];
            function collectTsFiles(dir) {
                for (const item of fs_1.default.readdirSync(dir)) {
                    const fullPath = path_1.default.join(dir, item);
                    if (fs_1.default.statSync(fullPath).isDirectory()) {
                        collectTsFiles(fullPath);
                    }
                    else if (fullPath.endsWith('.service.ts')) {
                        files.push(fullPath);
                    }
                }
            }
            collectTsFiles(modulesDir);
            expect(files.length).toBeGreaterThan(0);
            for (const file of files) {
                const content = fs_1.default.readFileSync(file, 'utf8');
                expect(content).not.toContain('.assetRevision.create');
                expect(content).not.toContain('prisma.assetRevision.create');
            }
        });
        it('verifies no route file directly imports PrismaClient', () => {
            const modulesDir = path_1.default.resolve(__dirname, '../modules');
            const routeFiles = [];
            function collectRouteFiles(dir) {
                for (const item of fs_1.default.readdirSync(dir)) {
                    const fullPath = path_1.default.join(dir, item);
                    if (fs_1.default.statSync(fullPath).isDirectory()) {
                        collectRouteFiles(fullPath);
                    }
                    else if (fullPath.endsWith('.routes.ts')) {
                        routeFiles.push(fullPath);
                    }
                }
            }
            collectRouteFiles(modulesDir);
            expect(routeFiles.length).toBeGreaterThan(0);
            for (const file of routeFiles) {
                const content = fs_1.default.readFileSync(file, 'utf8');
                expect(content).not.toContain('PrismaClient');
                expect(content).not.toContain('@prisma/client');
            }
        });
    });
});
