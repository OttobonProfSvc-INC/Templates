"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const crypto_1 = __importDefault(require("crypto"));
const jose_1 = require("jose");
const system_actor_1 = require("../infrastructure/system-actor");
describe('sBLOOM Organization Mode — End-User Authentication Removal & System Actor Verification', () => {
    const privateKey = process.env.__TEST_PRIVATE_KEY__;
    async function createInternalToken(claims = {}, subject = 'sbloom-bff') {
        const alg = 'RS256';
        const pkcs8 = await (0, jose_1.importPKCS8)(privateKey, alg);
        return new jose_1.SignJWT(claims)
            .setProtectedHeader({ alg })
            .setIssuedAt()
            .setIssuer('sbloom-bff')
            .setAudience('sbloom-backend')
            .setExpirationTime('15s')
            .setSubject(subject)
            .setJti(crypto_1.default.randomUUID())
            .sign(pkcs8);
    }
    describe('1. Normal Application Routes Accessible Without User Identity', () => {
        it('GET /api/templates succeeds without user identity or Authorization header', async () => {
            const res = await (0, supertest_1.default)(app_1.default).get('/api/templates');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
        });
        it('GET /api/templates/:id succeeds without user identity or Authorization header', async () => {
            const listRes = await (0, supertest_1.default)(app_1.default).get('/api/templates');
            const targetId = listRes.body[0]?.id;
            const res = await (0, supertest_1.default)(app_1.default).get(`/api/templates/${targetId}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(targetId);
            expect(res.body.document).toBeDefined();
        });
        it('GET /api/my-work succeeds without NextAuth identity or Authorization header', async () => {
            const res = await (0, supertest_1.default)(app_1.default).get('/api/my-work');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
        it('GET /api/workspace succeeds without NextAuth identity or Authorization header', async () => {
            const res = await (0, supertest_1.default)(app_1.default).get('/api/workspace');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });
    describe('2. System Actor Resolution & Server-Side Technical Identity', () => {
        it('system actor resolves server-side from database/system actor service', async () => {
            const actor = await system_actor_1.systemActorService.getSystemActor();
            expect(actor).toBeDefined();
            expect(actor.id).toBeDefined();
            expect(typeof actor.id).toBe('string');
            expect(actor.role).toBe('ADMIN');
            expect(actor.isActive).toBe(true);
        });
        it('audit/lifecycle operations receive valid system actor UUID', async () => {
            const systemActor = await system_actor_1.systemActorService.getSystemActor();
            const listRes = await (0, supertest_1.default)(app_1.default).get('/api/templates');
            const targetId = listRes.body.find((t) => t.isCustomizable)?.id || listRes.body[0]?.id;
            // Customize template without any client user identity
            const customizeRes = await (0, supertest_1.default)(app_1.default)
                .post(`/api/templates/${targetId}/customize`)
                .send({ title: 'Org High School Campaign' });
            expect(customizeRes.status).toBe(201);
            expect(customizeRes.body.ownerId).toBe(systemActor.id);
            expect(customizeRes.body.title).toBe('Org High School Campaign');
            const customizationId = customizeRes.body.id;
            // Fetch customization without any client user identity
            const getRes = await (0, supertest_1.default)(app_1.default).get(`/api/customizations/${customizationId}`);
            expect(getRes.status).toBe(200);
            expect(getRes.body.ownerId).toBe(systemActor.id);
            // Save customization without any client user identity
            const saveRes = await (0, supertest_1.default)(app_1.default)
                .put(`/api/customizations/${customizationId}`)
                .send({
                title: 'Org High School Campaign - Updated',
                document: getRes.body.document,
            });
            expect(saveRes.status).toBe(200);
            expect(saveRes.body.title).toBe('Org High School Campaign - Updated');
            // Export customization without any client user identity
            const exportRes = await (0, supertest_1.default)(app_1.default)
                .post(`/api/customizations/${customizationId}/export`)
                .send({ format: 'PNG' });
            expect(exportRes.status).toBe(200);
            expect(exportRes.body.status).toBe('ready');
            // Delete customization without any client user identity
            const deleteRes = await (0, supertest_1.default)(app_1.default).delete(`/api/customizations/${customizationId}`);
            expect(deleteRes.status).toBe(200);
            expect(deleteRes.body.status).toBe('deleted');
        });
    });
    describe('3. Browser-Supplied Role/Identity Untrusted', () => {
        it('ignores client-supplied role and sub claims; authoritative system actor is used', async () => {
            const systemActor = await system_actor_1.systemActorService.getSystemActor();
            // Attacker attempts to forge a token with fake role and fake user identity
            const forgedToken = await createInternalToken({ role: 'UNAUTHORIZED_ROLE', email: 'attacker@evil.com' }, 'attacker-id-999');
            const res = await (0, supertest_1.default)(app_1.default)
                .get('/api/templates')
                .set('Authorization', `Bearer ${forgedToken}`);
            // The request succeeds because server-side system actor is resolved authoritatively, NOT the client's role
            expect(res.status).toBe(200);
            const listRes = await (0, supertest_1.default)(app_1.default).get('/api/templates');
            const targetId = listRes.body.find((t) => t.isCustomizable)?.id || listRes.body[0]?.id;
            // Verify on customize that creatorId is systemActor.id, NEVER attacker-id-999
            const custRes = await (0, supertest_1.default)(app_1.default)
                .post(`/api/templates/${targetId}/customize`)
                .set('Authorization', `Bearer ${forgedToken}`)
                .send({ title: 'Untrusted Identity Verification' });
            expect(custRes.status).toBe(201);
            expect(custRes.body.ownerId).toBe(systemActor.id);
            expect(custRes.body.ownerId).not.toBe('attacker-id-999');
        });
        it('rejects malformed or cryptographically invalid internal tokens with 401', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .get('/api/templates')
                .set('Authorization', 'Bearer totally-invalid-and-forged-token-bytes');
            expect(res.status).toBe(401);
        });
    });
});
