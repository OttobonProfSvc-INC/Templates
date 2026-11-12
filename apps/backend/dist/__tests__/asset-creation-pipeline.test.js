"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const jose_1 = require("jose");
const asset_routes_1 = require("../modules/assets/asset.routes");
const template_routes_1 = require("../modules/templates/template.routes");
const error_handler_1 = require("../middleware/error-handler");
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
// Configure test Express app
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: '10mb' }));
app.use(asset_routes_1.assetRouter);
app.use(template_routes_1.templateRouter);
app.use(error_handler_1.errorHandler);
describe('Asset Creation & Master Asset Ingestion Pipeline', () => {
    let contributorToken;
    let adminToken;
    beforeAll(async () => {
        jest.setTimeout(30000);
        contributorToken = await createAuthToken('contributor-test-01', 'CONTRIBUTOR');
        adminToken = await createAuthToken('admin-test-01', 'ADMIN');
    });
    describe('1. Backwards Compatibility Stub Contract', () => {
        it('returns status created when empty body is posted by contributor', async () => {
            const res = await (0, supertest_1.default)(app)
                .post('/api/assets')
                .set('Authorization', `Bearer ${contributorToken}`)
                .send({});
            expect(res.status).toBe(201);
            expect(res.body.status).toBe('created');
            expect(res.body.creatorId).toBe('contributor-test-01');
        });
    });
    describe('2. Standard Asset Creation (Non-Editable)', () => {
        // 1x1 transparent PNG encoded in base64
        const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        it('creates a standard non-editable asset and verifies library discovery and customize restriction', async () => {
            const payload = {
                title: 'Spring Orientation Announcement',
                description: 'Standard creative banner for coaching social campaigns',
                category: 'Coaching',
                assetTypeCode: 'social-post',
                isCustomizable: false,
                classification: 'FLAT_IMAGE',
                width: 1080,
                height: 1350,
                fileName: 'orientation-banner.png',
                mimeType: 'image/png',
                fileData: `data:image/png;base64,${samplePngBase64}`,
            };
            const res = await (0, supertest_1.default)(app)
                .post('/api/assets')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(payload);
            expect(res.status).toBe(201);
            expect(res.body.id).toBeDefined();
            expect(res.body.title).toBe('Spring Orientation Announcement');
            expect(res.body.category).toBe('Coaching');
            expect(res.body.assetType).toBe('social-post');
            expect(res.body.isCustomizable).toBe(false);
            expect(res.body.classification).toBe('FLAT_IMAGE');
            expect(res.body.dimensions).toEqual({ width: 1080, height: 1350 });
            expect(res.body.thumbnailUrl).toContain('/api/assets/raw/Coaching/');
            expect(res.body.storageResult).toBeDefined();
            expect(res.body.storageResult.storageKey).toBe('templates/social-media/coaching/orientation-banner.png');
            const createdAssetId = res.body.id;
            // Verify asset appears in GET /api/assets
            const listRes = await (0, supertest_1.default)(app)
                .get('/api/assets')
                .set('Authorization', `Bearer ${contributorToken}`);
            expect(listRes.status).toBe(200);
            const foundInList = listRes.body.items.find((item) => item.id === createdAssetId);
            expect(foundInList).toBeDefined();
            expect(foundInList.isCustomizable).toBe(false);
            // Verify asset appears in GET /api/templates
            const templatesRes = await (0, supertest_1.default)(app)
                .get('/api/templates')
                .set('Authorization', `Bearer ${contributorToken}`);
            expect(templatesRes.status).toBe(200);
            const foundInTemplates = templatesRes.body.find((item) => item.id === createdAssetId);
            expect(foundInTemplates).toBeDefined();
            // Verify standard asset CAN be customized to create independent copy
            const customizeRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${createdAssetId}/customize`)
                .set('Authorization', `Bearer ${contributorToken}`)
                .send({});
            expect(customizeRes.status).toBe(201);
            expect(customizeRes.body.sourceTemplateId).toBe(createdAssetId);
        });
    });
    describe('3. Editable Template Creation (Customizable Canvas)', () => {
        const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        it('creates an editable template with structured document layers that allows customization', async () => {
            const payload = {
                title: 'Admissions Open 2027 College Template',
                description: 'Layered master design for college admissions with editable headline',
                category: 'Colleges',
                assetTypeCode: 'social-post',
                isCustomizable: true,
                classification: 'STRUCTURED_TEMPLATE',
                width: 1080,
                height: 1080,
                fileName: 'admissions-open-2027.png',
                mimeType: 'image/png',
                fileData: `data:image/png;base64,${samplePngBase64}`,
            };
            const res = await (0, supertest_1.default)(app)
                .post('/api/assets')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(payload);
            expect(res.status).toBe(201);
            expect(res.body.isCustomizable).toBe(true);
            expect(res.body.classification).toBe('STRUCTURED_TEMPLATE');
            expect(res.body.document).toBeDefined();
            expect(res.body.document.elements.length).toBeGreaterThan(0);
            expect(res.body.document.elements[0].text).toBe('Admissions Open 2027 College Template');
            const createdAssetId = res.body.id;
            // Verify editable template allows customization
            const customizeRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${createdAssetId}/customize`)
                .set('Authorization', `Bearer ${contributorToken}`)
                .send({ title: 'My Custom Admissions Copy' });
            expect(customizeRes.status).toBe(201);
            expect(customizeRes.body.id).toBeDefined();
            expect(customizeRes.body.title).toBe('My Custom Admissions Copy');
            expect(customizeRes.body.sourceTemplateId).toBe(createdAssetId);
        });
    });
    describe('4. Input Validation & Error Handling', () => {
        it('rejects invalid mime types (e.g. application/pdf)', async () => {
            const invalidPayload = {
                title: 'Invalid PDF Asset',
                category: 'Schools',
                assetTypeCode: 'social-post',
                width: 1080,
                height: 1080,
                fileName: 'document.pdf',
                mimeType: 'application/pdf',
                fileData: 'fake-data',
            };
            const res = await (0, supertest_1.default)(app)
                .post('/api/assets')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidPayload);
            expect(res.status).toBe(400);
        });
        it('rejects missing required fields (e.g. title missing)', async () => {
            const invalidPayload = {
                category: 'Schools',
                width: 1080,
                height: 1080,
                fileName: 'test.jpg',
                mimeType: 'image/jpeg',
                fileData: 'fake-data',
            };
            const res = await (0, supertest_1.default)(app)
                .post('/api/assets')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidPayload);
            expect(res.status).toBe(400);
        });
    });
});
