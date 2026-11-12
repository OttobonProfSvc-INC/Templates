"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const crypto_1 = __importDefault(require("crypto"));
const jose_1 = require("jose");
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
        .setExpirationTime('15s')
        .setSubject(userId)
        .setJti(crypto_1.default.randomUUID());
    return jwt.sign(pkcs8);
}
describe('Customizable Template Architecture & Lifecycle', () => {
    const contributor1 = 'contributor-alpha';
    const contributor2 = 'contributor-beta';
    const adminUser = 'admin-prime';
    let token1;
    let token2;
    let adminToken;
    let createdCustomizationId;
    beforeAll(async () => {
        token1 = await createAuthToken(contributor1, 'CONTRIBUTOR');
        token2 = await createAuthToken(contributor2, 'CONTRIBUTOR');
        adminToken = await createAuthToken(adminUser, 'ADMIN');
    });
    describe('1. Template Ingestion & Library Browsing', () => {
        it('serves all 58 real templates loaded from manifest (56 flat + 2 structured)', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .get('/api/templates')
                .set('Authorization', `Bearer ${token1}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThanOrEqual(58);
        });
        it('filters templates accurately by category', async () => {
            const coachingRes = await (0, supertest_1.default)(app_1.default)
                .get('/api/templates?category=Coaching')
                .set('Authorization', `Bearer ${token1}`);
            expect(coachingRes.status).toBe(200);
            expect(coachingRes.body.length).toBe(16);
            expect(coachingRes.body.every((t) => t.category === 'Coaching')).toBe(true);
            const collegesRes = await (0, supertest_1.default)(app_1.default)
                .get('/api/templates?category=Colleges')
                .set('Authorization', `Bearer ${token1}`);
            expect(collegesRes.status).toBe(200);
            expect(collegesRes.body.length).toBe(22);
            expect(collegesRes.body.every((t) => t.category === 'Colleges')).toBe(true);
            const schoolsRes = await (0, supertest_1.default)(app_1.default)
                .get('/api/templates?category=Schools')
                .set('Authorization', `Bearer ${token1}`);
            expect(schoolsRes.status).toBe(200);
            expect(schoolsRes.body.length).toBe(20);
            expect(schoolsRes.body.every((t) => t.category === 'Schools')).toBe(true);
        });
        it('returns template detail by id with structured TemplateDocument', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .get('/api/templates/tmpl-schools-1')
                .set('Authorization', `Bearer ${token1}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe('tmpl-schools-1');
            expect(res.body.classification).toBe('STRUCTURED_TEMPLATE');
            expect(res.body.isCustomizable).toBe(true);
            expect(res.body.document).toBeDefined();
            expect(res.body.document.documentVersion).toBe(1);
            expect(res.body.document.elements.length).toBeGreaterThan(0);
        });
    });
    describe('2. Template Customization & Copy Creation (Canva-like flow)', () => {
        it('creates an independent editable copy without mutating base template', async () => {
            const baseBefore = template_store_1.templateStore.getTemplateById('tmpl-schools-1');
            const originalHeading = (baseBefore.document?.elements.find((e) => e.id === 'el-heading'))?.text;
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/templates/tmpl-schools-1/customize')
                .set('Authorization', `Bearer ${token1}`)
                .send({ title: 'Springfield High Admissions 2026' });
            expect(res.status).toBe(201);
            expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
            expect(res.body.sourceTemplateId).toBe('tmpl-schools-1');
            expect(res.body.title).toBe('Springfield High Admissions 2026');
            expect(res.body.revisionNumber).toBe(1);
            createdCustomizationId = res.body.id;
            // Base template document must be 100% intact
            const baseAfter = template_store_1.templateStore.getTemplateById('tmpl-schools-1');
            expect((baseAfter.document?.elements.find((e) => e.id === 'el-heading'))?.text).toBe(originalHeading);
        });
        it('allows fetching customization in organization workspace', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .get(`/api/customizations/${createdCustomizationId}`)
                .set('Authorization', `Bearer ${token1}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(createdCustomizationId);
            expect(res.body.title).toBe('Springfield High Admissions 2026');
        });
        it('allows access to customization without requiring user identity (Organization Mode)', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .get(`/api/customizations/${createdCustomizationId}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(createdCustomizationId);
        });
        it('allows saving edits to design and increments revision number', async () => {
            const getRes = await (0, supertest_1.default)(app_1.default)
                .get(`/api/customizations/${createdCustomizationId}`);
            const doc = getRes.body.document;
            const heading = doc.elements.find((e) => e.id === 'el-heading');
            if (heading)
                heading.text = 'Springfield High - Enroll Now!';
            const saveRes = await (0, supertest_1.default)(app_1.default)
                .put(`/api/customizations/${createdCustomizationId}`)
                .send({
                title: 'Springfield High Admissions - Final Polish',
                document: doc,
            });
            expect(saveRes.status).toBe(200);
            expect(saveRes.body.title).toBe('Springfield High Admissions - Final Polish');
            expect(saveRes.body.revisionNumber).toBe(2);
            expect(saveRes.body.document.elements.find((e) => e.id === 'el-heading').text).toBe('Springfield High - Enroll Now!');
            // Base template STILL unaffected
            const base = template_store_1.templateStore.getTemplateById('tmpl-schools-1');
            expect((base.document?.elements.find((e) => e.id === 'el-heading'))?.text).not.toBe('Springfield High - Enroll Now!');
        });
        it('allows updating customization in organization workspace', async () => {
            const getRes = await (0, supertest_1.default)(app_1.default).get(`/api/customizations/${createdCustomizationId}`);
            const doc = getRes.body.document;
            const saveRes = await (0, supertest_1.default)(app_1.default)
                .put(`/api/customizations/${createdCustomizationId}`)
                .send({
                title: 'Springfield High Admissions - Team Edit',
                document: doc,
            });
            expect(saveRes.status).toBe(200);
            expect(saveRes.body.title).toBe('Springfield High Admissions - Team Edit');
        });
    });
    describe('3. Workspace Integration & Export Flow', () => {
        it('returns workspace customizations under /api/my-work and /api/workspace', async () => {
            const res1 = await (0, supertest_1.default)(app_1.default).get('/api/my-work');
            expect(res1.status).toBe(200);
            expect(Array.isArray(res1.body)).toBe(true);
            const res2 = await (0, supertest_1.default)(app_1.default).get('/api/workspace');
            expect(res2.status).toBe(200);
            expect(Array.isArray(res2.body)).toBe(true);
        });
        it('records export telemetry on /api/customizations/:id/export', async () => {
            const exportRes = await (0, supertest_1.default)(app_1.default)
                .post(`/api/customizations/${createdCustomizationId}/export`)
                .send({ format: 'PNG' });
            expect(exportRes.status).toBe(200);
            expect(exportRes.body.status).toBe('ready');
            expect(exportRes.body.format).toBe('PNG');
            const telemetry = template_store_1.templateStore.getTelemetry();
            const exportEntry = telemetry.find(t => t.assetId === createdCustomizationId && t.action === 'DOWNLOAD');
            expect(exportEntry).toBeDefined();
        });
    });
});
