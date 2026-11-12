"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const crypto_1 = __importDefault(require("crypto"));
const jose_1 = require("jose");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
const request_id_1 = require("../middleware/request-id");
describe('Phase 4J: End-to-End BFF -> Backend JWT Trust Verification', () => {
    const privateKeyPem = process.env.__TEST_PRIVATE_KEY__;
    const testApp = (0, express_1.default)();
    testApp.use(request_id_1.requestIdMiddleware);
    testApp.use(express_1.default.json());
    testApp.get('/test-bff-trust', auth_1.requireInternalAuth, (req, res) => {
        res.json({
            authenticated: true,
            userId: req.user?.id,
            role: req.user?.role,
        });
    });
    testApp.use(error_handler_1.errorHandler);
    async function createBffToken(options = {}) {
        const alg = 'RS256';
        const key = options.signingKey || privateKeyPem;
        const pkcs8 = await (0, jose_1.importPKCS8)(key, alg);
        const jwt = new jose_1.SignJWT(options.role ? { role: options.role } : {})
            .setProtectedHeader({ alg })
            .setIssuedAt()
            .setIssuer(options.issuer ?? 'sbloom-bff')
            .setAudience(options.audience ?? 'sbloom-backend')
            .setExpirationTime(options.expirationTime ?? '15s');
        if (options.includeSub !== false) {
            jwt.setSubject(options.userId ?? 'contributor-user-001');
        }
        if (options.includeJti !== false) {
            jwt.setJti(crypto_1.default.randomUUID());
        }
        return jwt.sign(pkcs8);
    }
    it('1. Correct matching RS256 token is accepted by backend auth middleware', async () => {
        const token = await createBffToken({ userId: 'contributor-user-001', role: 'CONTRIBUTOR' });
        const res = await (0, supertest_1.default)(testApp)
            .get('/test-bff-trust')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.authenticated).toBe(true);
        expect(res.body.userId).toBe('contributor-user-001');
    });
    it('2. Token signed with wrong private key is rejected with 401 UNAUTHORIZED', async () => {
        const foreignKeypair = crypto_1.default.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        const foreignToken = await createBffToken({ signingKey: foreignKeypair.privateKey });
        const res = await (0, supertest_1.default)(testApp)
            .get('/test-bff-trust')
            .set('Authorization', `Bearer ${foreignToken}`);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
    it('3. Token with wrong issuer is rejected with 401 UNAUTHORIZED', async () => {
        const invalidIssuerToken = await createBffToken({ issuer: 'untrusted-external-issuer' });
        const res = await (0, supertest_1.default)(testApp)
            .get('/test-bff-trust')
            .set('Authorization', `Bearer ${invalidIssuerToken}`);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
    it('4. Token with wrong audience is rejected with 401 UNAUTHORIZED', async () => {
        const invalidAudienceToken = await createBffToken({ audience: 'wrong-backend-audience' });
        const res = await (0, supertest_1.default)(testApp)
            .get('/test-bff-trust')
            .set('Authorization', `Bearer ${invalidAudienceToken}`);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
    it('5. Expired token (outside 15-second window) is rejected with 401 UNAUTHORIZED', async () => {
        const expiredToken = await createBffToken({ expirationTime: Math.floor(Date.now() / 1000) - 30 });
        const res = await (0, supertest_1.default)(testApp)
            .get('/test-bff-trust')
            .set('Authorization', `Bearer ${expiredToken}`);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
    it('6. Token missing subject (sub) claim is rejected with 401 UNAUTHORIZED', async () => {
        const missingSubToken = await createBffToken({ includeSub: false });
        const res = await (0, supertest_1.default)(testApp)
            .get('/test-bff-trust')
            .set('Authorization', `Bearer ${missingSubToken}`);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
    it('7. Token missing jti claim is rejected with 401 UNAUTHORIZED', async () => {
        const missingJtiToken = await createBffToken({ includeJti: false });
        const res = await (0, supertest_1.default)(testApp)
            .get('/test-bff-trust')
            .set('Authorization', `Bearer ${missingJtiToken}`);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
});
