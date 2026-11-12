"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const jose_1 = require("jose");
const privateKey = process.env.__TEST_PRIVATE_KEY__;
async function signToken(payload, options = {}) {
    const alg = 'RS256';
    const pkcs8 = await (0, jose_1.importPKCS8)(privateKey, alg);
    const jwt = new jose_1.SignJWT(payload).setProtectedHeader({ alg }).setIssuedAt();
    if (options.issuer)
        jwt.setIssuer(options.issuer);
    if (options.audience)
        jwt.setAudience(options.audience);
    if (options.expirationTime)
        jwt.setExpirationTime(options.expirationTime);
    if (options.subject)
        jwt.setSubject(options.subject);
    if (options.jti)
        jwt.setJti(options.jti);
    return jwt.sign(pkcs8);
}
describe('Internal API Auth', () => {
    it('should accept valid token', async () => {
        const token = await signToken({}, {
            issuer: 'sbloom-bff',
            audience: 'sbloom-backend',
            expirationTime: '15s',
            subject: 'user-123',
            jti: 'test-uuid'
        });
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/internal/whoami')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: 'user-123' });
    });
    it('should reject requests without token', async () => {
        const res = await (0, supertest_1.default)(app_1.default).get('/internal/whoami');
        expect(res.status).toBe(401);
    });
    it('should reject invalid token signature', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .get('/internal/whoami')
            .set('Authorization', `Bearer invalid-token.abc.def`);
        expect(res.status).toBe(401);
    });
    it('should reject wrong issuer', async () => {
        const token = await signToken({}, {
            issuer: 'wrong-issuer',
            audience: 'sbloom-backend',
            expirationTime: '15s',
            subject: 'user-123',
            jti: 'test-uuid'
        });
        const res = await (0, supertest_1.default)(app_1.default).get('/internal/whoami').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
    });
    it('should reject missing subject', async () => {
        const token = await signToken({}, {
            issuer: 'sbloom-bff',
            audience: 'sbloom-backend',
            expirationTime: '15s',
            jti: 'test-uuid'
        });
        const res = await (0, supertest_1.default)(app_1.default).get('/internal/whoami').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
    });
});
