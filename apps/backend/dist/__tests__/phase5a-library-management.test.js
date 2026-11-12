"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const jose_1 = require("jose");
const template_routes_1 = require("../modules/templates/template.routes");
const collection_routes_1 = require("../modules/collections/collection.routes");
const error_handler_1 = require("../middleware/error-handler");
const template_store_1 = require("../template-store");
const privateKey = process.env.__TEST_PRIVATE_KEY__;
async function createAuthToken(userId, role) {
    const alg = 'RS256';
    const pkcs8 = await (0, jose_1.importPKCS8)(privateKey, alg);
    const jwt = new jose_1.SignJWT({ role })
        .setProtectedHeader({ alg })
        .setIssuedAt()
        .setIssuer('sbloom-bff')
        .setAudience('sbloom-backend')
        .setExpirationTime('1h')
        .setSubject(userId)
        .setJti(crypto_1.default.randomUUID());
    return jwt.sign(pkcs8);
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(template_routes_1.templateRouter);
app.use(collection_routes_1.collectionRouter);
app.use(error_handler_1.errorHandler);
describe('Phase 5A — Library Management, Collections & Telemetry', () => {
    let token;
    let testTemplateId;
    beforeAll(async () => {
        jest.setTimeout(30000);
        token = await createAuthToken('sbloom-bff', 'ADMIN');
        const templates = await template_store_1.inMemoryTemplateStore.listTemplates();
        expect(templates.length).toBeGreaterThan(0);
        testTemplateId = templates[0].id;
    });
    describe('1. Asset Detail View & Usage Telemetry', () => {
        it('returns template detail with aggregated usage and customizations', async () => {
            const res = await (0, supertest_1.default)(app)
                .get(`/api/templates/${testTemplateId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(testTemplateId);
            expect(res.body.usages).toBeDefined();
            expect(res.body.usages.total).toBeDefined();
            expect(Array.isArray(res.body.customizations)).toBe(true);
            expect(Array.isArray(res.body.collectionIds)).toBe(true);
        });
        it('records PREVIEW and DOWNLOAD usage events without error', async () => {
            const previewRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${testTemplateId}/usage`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'PREVIEW' });
            expect(previewRes.status).toBe(200);
            expect(previewRes.body.success).toBe(true);
            const downloadRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${testTemplateId}/usage`)
                .set('Authorization', `Bearer ${token}`)
                .send({ action: 'DOWNLOAD' });
            expect(downloadRes.status).toBe(200);
            expect(downloadRes.body.success).toBe(true);
            // Verify updated count in detail
            const detailRes = await (0, supertest_1.default)(app)
                .get(`/api/templates/${testTemplateId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(detailRes.status).toBe(200);
            expect(detailRes.body.usages.previews).toBeGreaterThanOrEqual(1);
            expect(detailRes.body.usages.downloads).toBeGreaterThanOrEqual(1);
        });
    });
    describe('2. Archive and Restore Flow', () => {
        it('archives a template, removes it from active list, and lists it in archived', async () => {
            // 1. Archive
            const archiveRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${testTemplateId}/archive`)
                .set('Authorization', `Bearer ${token}`);
            expect(archiveRes.status).toBe(200);
            expect(archiveRes.body.status).toBe('archived');
            // 2. Check archived endpoint
            const archivedRes = await (0, supertest_1.default)(app)
                .get('/api/templates/archived')
                .set('Authorization', `Bearer ${token}`);
            expect(archivedRes.status).toBe(200);
            expect(archivedRes.body.some((t) => t.id === testTemplateId)).toBe(true);
            // 3. Restore
            const restoreRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${testTemplateId}/restore`)
                .set('Authorization', `Bearer ${token}`);
            expect(restoreRes.status).toBe(200);
            expect(restoreRes.body.status).toBe('active');
            // 4. Verify restored in active list
            const activeRes = await (0, supertest_1.default)(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${token}`);
            expect(activeRes.status).toBe(200);
            expect(activeRes.body.some((t) => t.id === testTemplateId)).toBe(true);
        });
        it('bulk archives multiple templates safely', async () => {
            const templates = await template_store_1.inMemoryTemplateStore.listTemplates();
            const targetIds = [templates[0].id, templates[1].id];
            const bulkRes = await (0, supertest_1.default)(app)
                .post('/api/templates/bulk-archive')
                .set('Authorization', `Bearer ${token}`)
                .send({ assetIds: targetIds });
            expect(bulkRes.status).toBe(200);
            expect(bulkRes.body.count).toBe(2);
            // Restore both back
            for (const id of targetIds) {
                await (0, supertest_1.default)(app)
                    .post(`/api/templates/${id}/restore`)
                    .set('Authorization', `Bearer ${token}`);
            }
        });
    });
    describe('3. Collections CRUD & Membership', () => {
        let createdCollectionId;
        it('creates an organization-wide collection', async () => {
            const res = await (0, supertest_1.default)(app)
                .post('/api/collections')
                .set('Authorization', `Bearer ${token}`)
                .send({
                name: 'STEM Admissions 2026',
                description: 'Curated marketing posts and landing pages',
            });
            expect(res.status).toBe(201);
            expect(res.body.name).toBe('STEM Admissions 2026');
            expect(res.body.id).toBeDefined();
            createdCollectionId = res.body.id;
        });
        it('lists all organization collections', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/collections')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.some((c) => c.id === createdCollectionId)).toBe(true);
        });
        it('renames a collection', async () => {
            const res = await (0, supertest_1.default)(app)
                .put(`/api/collections/${createdCollectionId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'STEM Admissions 2026-27 Renamed' });
            expect(res.status).toBe(200);
            expect(res.body.name).toBe('STEM Admissions 2026-27 Renamed');
        });
        it('adds assets to collection and retrieves collection detail', async () => {
            const addRes = await (0, supertest_1.default)(app)
                .post(`/api/collections/${createdCollectionId}/assets`)
                .set('Authorization', `Bearer ${token}`)
                .send({ assetIds: [testTemplateId] });
            expect(addRes.status).toBe(200);
            const detailRes = await (0, supertest_1.default)(app)
                .get(`/api/collections/${createdCollectionId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(detailRes.status).toBe(200);
            expect(detailRes.body.id).toBe(createdCollectionId);
        });
        it('removes an asset from collection', async () => {
            const removeRes = await (0, supertest_1.default)(app)
                .delete(`/api/collections/${createdCollectionId}/assets/${testTemplateId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(removeRes.status).toBe(200);
        });
        it('deletes a collection', async () => {
            const delRes = await (0, supertest_1.default)(app)
                .delete(`/api/collections/${createdCollectionId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(delRes.status).toBe(200);
            expect(delRes.body.status).toBe('deleted');
        });
    });
});
