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
describe('Phase 4I-4: Authoritative Authentication & Role Verification Tests', () => {
    // Use the isolated test private key configured before module loading by test-env-setup.ts
    const privateKeyPem = process.env.__TEST_PRIVATE_KEY__;
    const testApp = (0, express_1.default)();
    testApp.use(request_id_1.requestIdMiddleware);
    testApp.use(express_1.default.json());
    testApp.get('/test-auth', auth_1.requireInternalAuth, (req, res) => {
        res.json({ user: req.user });
    });
    testApp.use(error_handler_1.errorHandler);
    async function createToken(payload, options = {}) {
        const alg = 'RS256';
        const key = options.key || privateKeyPem;
        const pkcs8 = await (0, jose_1.importPKCS8)(key, alg);
        const jwt = new jose_1.SignJWT(payload).setProtectedHeader({ alg }).setIssuedAt();
        jwt.setIssuer(options.issuer ?? 'sbloom-bff');
        jwt.setAudience(options.audience ?? 'sbloom-backend');
        jwt.setExpirationTime(options.expirationTime ?? '15s');
        if (options.subject !== undefined) {
            jwt.setSubject(options.subject);
        }
        jwt.setJti(options.jti ?? crypto_1.default.randomUUID());
        return jwt.sign(pkcs8);
    }
    afterEach(() => {
        jest.restoreAllMocks();
    });
    describe('JWT Verification & In-Memory Mode (4I-4.1)', () => {
        it('1. Rejects missing Authorization header with 401 UNAUTHORIZED', async () => {
            const res = await (0, supertest_1.default)(testApp).get('/test-auth');
            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('UNAUTHORIZED');
        });
        it('2. Rejects malformed token with 401 UNAUTHORIZED', async () => {
            const res = await (0, supertest_1.default)(testApp)
                .get('/test-auth')
                .set('Authorization', 'Bearer not-a-valid-jwt-token');
            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('UNAUTHORIZED');
        });
        it('3. Rejects token signed by unknown private key with 401 UNAUTHORIZED', async () => {
            const otherKeys = crypto_1.default.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            });
            const foreignToken = await createToken({ role: 'CONTRIBUTOR' }, {
                subject: 'user-001',
                key: otherKeys.privateKey,
            });
            const res = await (0, supertest_1.default)(testApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${foreignToken}`);
            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('UNAUTHORIZED');
        });
        it('4. Rejects expired token with 401 UNAUTHORIZED', async () => {
            const expiredToken = await createToken({ role: 'CONTRIBUTOR' }, {
                subject: 'user-001',
                expirationTime: Math.floor(Date.now() / 1000) - 30,
            });
            const res = await (0, supertest_1.default)(testApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${expiredToken}`);
            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('UNAUTHORIZED');
        });
        it('5. Safe 500 when server RSA configuration has invalid public key format', async () => {
            let misconfiguredApp;
            const prevKey = process.env.INTERNAL_API_PUBLIC_KEY;
            try {
                process.env.INTERNAL_API_PUBLIC_KEY = 'invalid-rsa-public-key-material';
                jest.isolateModules(() => {
                    const { requireInternalAuth: isolatedAuth } = require('../middleware/auth');
                    const { errorHandler: isolatedErrorHandler } = require('../middleware/error-handler');
                    const { requestIdMiddleware: isolatedReqId } = require('../middleware/request-id');
                    misconfiguredApp = (0, express_1.default)();
                    misconfiguredApp.use(isolatedReqId);
                    misconfiguredApp.use(express_1.default.json());
                    misconfiguredApp.get('/test-auth', isolatedAuth, (req, res) => {
                        res.json({ user: req.user });
                    });
                    misconfiguredApp.use(isolatedErrorHandler);
                });
                const token = await createToken({ role: 'CONTRIBUTOR' }, { subject: 'user-001' });
                const res = await (0, supertest_1.default)(misconfiguredApp).get('/test-auth').set('Authorization', `Bearer ${token}`);
                expect(res.status).toBe(500);
                expect(res.body.error.code).toBe('INTERNAL_ERROR');
                expect(res.body.error.message).toBe('An unexpected internal error occurred');
                expect(res.body.error.details).toBeUndefined();
                // Sensitive details must be redacted/suppressed
                expect(JSON.stringify(res.body)).not.toContain('invalid-rsa-public-key-material');
            }
            finally {
                process.env.INTERNAL_API_PUBLIC_KEY = prevKey;
            }
        });
    });
    describe('Database Mode Authoritative Identity Lookup (4I-4.2)', () => {
        let dbApp;
        let isolatedUserRepo;
        let savedStorageEnv;
        beforeAll(() => {
            savedStorageEnv = process.env.USE_DATABASE_STORAGE;
            process.env.USE_DATABASE_STORAGE = 'true';
            jest.isolateModules(() => {
                const { requireInternalAuth: isolatedAuth } = require('../middleware/auth');
                const { errorHandler: isolatedErrorHandler } = require('../middleware/error-handler');
                const { requestIdMiddleware: isolatedReqId } = require('../middleware/request-id');
                isolatedUserRepo = require('../modules/users/user.repository').userRepository;
                dbApp = (0, express_1.default)();
                dbApp.use(isolatedReqId);
                dbApp.use(express_1.default.json());
                dbApp.get('/test-auth', isolatedAuth, (req, res) => {
                    res.json({ user: req.user });
                });
                dbApp.use(isolatedErrorHandler);
            });
        });
        afterAll(() => {
            if (savedStorageEnv !== undefined) {
                process.env.USE_DATABASE_STORAGE = savedStorageEnv;
            }
            else {
                delete process.env.USE_DATABASE_STORAGE;
            }
        });
        afterEach(() => {
            jest.restoreAllMocks();
        });
        it('6. Rejects valid JWT when no application user exists in DB mode with 403 FORBIDDEN', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserById').mockResolvedValue(null);
            const token = await createToken({ role: 'CONTRIBUTOR' }, { subject: 'non-existent-user' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
            expect(res.body.error.message).toContain('No corresponding application user found');
        });
        it('7. Rejects inactive application user in DB mode with 403 FORBIDDEN', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserById').mockResolvedValue({
                id: 'inactive-user',
                role: 'CONTRIBUTOR',
                isActive: false,
            });
            const token = await createToken({ role: 'CONTRIBUTOR' }, { subject: 'inactive-user' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
            expect(res.body.error.message).toContain('inactive');
        });
        it('8. Authenticates valid active CONTRIBUTOR from authoritative DB lookup', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserById').mockResolvedValue({
                id: 'active-contributor',
                role: 'CONTRIBUTOR',
                isActive: true,
            });
            const token = await createToken({ role: 'CONTRIBUTOR' }, { subject: 'active-contributor' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.user).toEqual({
                id: 'active-contributor',
                role: 'CONTRIBUTOR',
                isActive: true,
            });
        });
        it('9. Authenticates valid active ADMIN from authoritative DB lookup', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserById').mockResolvedValue({
                id: 'active-admin',
                role: 'ADMIN',
                isActive: true,
            });
            const token = await createToken({ role: 'ADMIN' }, { subject: 'active-admin' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.user).toEqual({
                id: 'active-admin',
                role: 'ADMIN',
                isActive: true,
            });
        });
        it('10. Returns 503 DATABASE_UNAVAILABLE when database identity lookup fails', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserById').mockRejectedValue(new Error('Connection to PostgreSQL terminated unexpectedly'));
            const token = await createToken({ role: 'CONTRIBUTOR' }, { subject: 'user-db-down' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(503);
            expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
            expect(res.body.error.message).toContain('Identity verification service degraded');
        });
        it('11. Enforces DB role wins when JWT role claim differs from DB role', async () => {
            // JWT claims ADMIN, but database authoritatively specifies CONTRIBUTOR
            jest.spyOn(isolatedUserRepo, 'findAuthUserById').mockResolvedValue({
                id: 'spoofed-role-user',
                role: 'CONTRIBUTOR',
                isActive: true,
            });
            const spoofedToken = await createToken({ role: 'ADMIN' }, { subject: 'spoofed-role-user' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${spoofedToken}`);
            expect(res.status).toBe(200);
            // Database authoritative role MUST WIN
            expect(res.body.user.role).toBe('CONTRIBUTOR');
            expect(res.body.user.role).not.toBe('ADMIN');
        });
        it('12. Resolves active application user by normalized email claim when subject is NextAuth ID', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserByEmail').mockResolvedValue({
                id: '22222222-aaaa-bbbb-cccc-333333333333',
                role: 'ADMIN',
                isActive: true,
            });
            const token = await createToken({ email: 'Admin@SBloom.com', role: 'CONTRIBUTOR' }, { subject: '1' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.user).toEqual({
                id: '22222222-aaaa-bbbb-cccc-333333333333',
                role: 'ADMIN',
                isActive: true,
            });
            expect(isolatedUserRepo.findAuthUserByEmail).toHaveBeenCalledWith('admin@sbloom.com', undefined);
        });
        it('13. Rejects inactive application user resolved by email claim with 403 FORBIDDEN', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserByEmail').mockResolvedValue({
                id: '22222222-aaaa-bbbb-cccc-444444444444',
                role: 'ADMIN',
                isActive: false,
            });
            const token = await createToken({ email: 'inactive@sbloom.com' }, { subject: '1' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
            expect(res.body.error.message).toContain('inactive');
        });
        it('14. Rejects request with 403 FORBIDDEN when user cannot be found by email or subject ID', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserByEmail').mockResolvedValue(null);
            jest.spyOn(isolatedUserRepo, 'findAuthUserById').mockResolvedValue(null);
            const token = await createToken({ email: 'unknown@sbloom.com' }, { subject: '99999999-9999-9999-9999-999999999999' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
            expect(res.body.error.message).toContain('No corresponding application user found');
        });
        it('15. Returns 503 DATABASE_UNAVAILABLE when database lookup by email fails', async () => {
            jest.spyOn(isolatedUserRepo, 'findAuthUserByEmail').mockRejectedValue(new Error('PostgreSQL connection dropped'));
            const token = await createToken({ email: 'admin@sbloom.com' }, { subject: '1' });
            const res = await (0, supertest_1.default)(dbApp)
                .get('/test-auth')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(503);
            expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
            expect(res.body.error.message).toContain('Identity verification service degraded');
        });
    });
});
