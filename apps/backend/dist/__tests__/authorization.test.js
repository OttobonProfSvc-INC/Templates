"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const crypto_1 = __importDefault(require("crypto"));
const jose_1 = require("jose");
const contracts_1 = require("@sbloom/contracts");
const authorization_1 = require("../authorization");
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
describe('Backend Authorization & Consolidated Role Model', () => {
    const adminId = 'admin-001';
    const contributorId = 'contributor-001';
    const otherContributorId = 'contributor-002';
    let adminToken;
    let contributorToken;
    let viewerLegacyToken;
    beforeAll(async () => {
        adminToken = await createAuthToken(adminId, 'ADMIN');
        contributorToken = await createAuthToken(contributorId, 'CONTRIBUTOR');
        viewerLegacyToken = await createAuthToken('legacy-001', 'VIEWER');
    });
    describe('1. Role Model Inventory & Validation', () => {
        it('contains exactly two product roles: ADMIN and CONTRIBUTOR', () => {
            expect(contracts_1.USER_ROLES).toEqual(['ADMIN', 'CONTRIBUTOR']);
            expect(contracts_1.USER_ROLES.length).toBe(2);
        });
        it('validates active roles successfully', () => {
            expect((0, contracts_1.isValidUserRole)('ADMIN')).toBe(true);
            expect((0, contracts_1.isValidUserRole)('CONTRIBUTOR')).toBe(true);
        });
        it('strictly rejects VIEWER as an active role', () => {
            expect((0, contracts_1.isValidUserRole)('VIEWER')).toBe(false);
            expect(() => (0, contracts_1.assertValidUserRole)('VIEWER')).toThrow(/Invalid UserRole/);
        });
    });
    describe('2. Contributor Unified Capabilities (Viewer + Contributor)', () => {
        it('allows Contributor to perform content consumption (old Viewer capabilities)', () => {
            expect(authorization_1.Capabilities.canBrowseLibrary('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canSearchAndFilter('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canViewAssetDetails('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canPreviewFiles('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canDownloadFiles('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canUsePublishedContent('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canManageCollections('CONTRIBUTOR')).toBe(true);
        });
        it('allows Contributor to perform content contribution', () => {
            expect(authorization_1.Capabilities.canCreateAsset('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canCreateDraftRevision('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canUploadDraftFiles('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canSubmitRevisionForReview('CONTRIBUTOR')).toBe(true);
            expect(authorization_1.Capabilities.canRespondToChanges('CONTRIBUTOR')).toBe(true);
        });
        it('allows Contributor to edit their OWN drafts', () => {
            expect(authorization_1.Capabilities.canEditDraft('CONTRIBUTOR', contributorId, contributorId)).toBe(true);
        });
        it('prevents Contributor from editing other users drafts', () => {
            expect(authorization_1.Capabilities.canEditDraft('CONTRIBUTOR', otherContributorId, contributorId)).toBe(false);
        });
        it('allows Contributor access to library/consumption endpoints', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .get('/api/assets')
                .set('Authorization', `Bearer ${contributorToken}`);
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
        });
        it('allows Contributor access to asset creation endpoints', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/assets')
                .set('Authorization', `Bearer ${contributorToken}`)
                .send({});
            expect(res.status).toBe(201);
            expect(res.body.creatorId).toBe(contributorId);
        });
    });
    describe('3. Contributor Restrictions (Cannot perform Admin actions)', () => {
        it('denies user administration to Contributor', () => {
            expect(authorization_1.Capabilities.canManageUsers('CONTRIBUTOR')).toBe(false);
        });
        it('denies role assignment to Contributor', () => {
            expect(authorization_1.Capabilities.canAssignRole('CONTRIBUTOR', 'ADMIN')).toBe(false);
            expect(authorization_1.Capabilities.canAssignRole('CONTRIBUTOR', 'CONTRIBUTOR')).toBe(false);
        });
        it('denies self-promotion', () => {
            expect(authorization_1.Capabilities.canPromoteSelf()).toBe(false);
        });
        it('denies review decisions to Contributor', () => {
            expect(authorization_1.Capabilities.canReviewRevision('CONTRIBUTOR', otherContributorId, contributorId)).toBe(false);
        });
        it('denies publishing directly to Contributor', () => {
            expect(authorization_1.Capabilities.canPublishAsset('CONTRIBUTOR')).toBe(false);
        });
        it('denies purge and recovery operations to Contributor', () => {
            expect(authorization_1.Capabilities.canPurgeAsset('CONTRIBUTOR')).toBe(false);
            expect(authorization_1.Capabilities.canRunStorageRecovery('CONTRIBUTOR')).toBe(false);
            expect(authorization_1.Capabilities.canAccessAuditLogs('CONTRIBUTOR')).toBe(false);
        });
        it('blocks Contributor from accessing admin review endpoint (403 Forbidden)', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/admin/reviews/decide')
                .set('Authorization', `Bearer ${contributorToken}`)
                .send({ authorId: otherContributorId, decision: 'APPROVED' });
            expect(res.status).toBe(403);
        });
        it('blocks Contributor from accessing admin role-assignment endpoint (403 Forbidden)', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post(`/api/admin/users/${contributorId}/role`)
                .set('Authorization', `Bearer ${contributorToken}`)
                .send({ role: 'ADMIN' });
            expect(res.status).toBe(403);
        });
        it('blocks Contributor from accessing admin purge endpoint (403 Forbidden)', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/admin/purge/asset-123')
                .set('Authorization', `Bearer ${contributorToken}`);
            expect(res.status).toBe(403);
        });
    });
    describe('4. Legacy / Invalid Role Rejection', () => {
        it('rejects legacy VIEWER tokens on protected endpoints with 403 Forbidden', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .get('/api/assets')
                .set('Authorization', `Bearer ${viewerLegacyToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error.message).toContain('Forbidden');
        });
        it('rejects assigning VIEWER role even by an Admin with 400 Bad Request', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post(`/api/admin/users/${contributorId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'VIEWER' });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });
    });
    describe('5. Admin Capabilities & Peer Review Boundaries', () => {
        it('allows Admin to perform all administrative operations', () => {
            expect(authorization_1.Capabilities.canManageUsers('ADMIN')).toBe(true);
            expect(authorization_1.Capabilities.canPublishAsset('ADMIN')).toBe(true);
            expect(authorization_1.Capabilities.canArchiveAsset('ADMIN')).toBe(true);
            expect(authorization_1.Capabilities.canPurgeAsset('ADMIN')).toBe(true);
            expect(authorization_1.Capabilities.canAccessAuditLogs('ADMIN')).toBe(true);
            expect(authorization_1.Capabilities.canManageAssetTypes('ADMIN')).toBe(true);
            expect(authorization_1.Capabilities.canRunStorageRecovery('ADMIN')).toBe(true);
        });
        it('allows Admin to edit any draft', () => {
            expect(authorization_1.Capabilities.canEditDraft('ADMIN', contributorId, adminId)).toBe(true);
        });
        it('allows Admin to review other users submissions', () => {
            expect(authorization_1.Capabilities.canReviewRevision('ADMIN', contributorId, adminId)).toBe(true);
        });
        it('prevents Admin from reviewing their own submissions (Peer Review Rule)', () => {
            expect(authorization_1.Capabilities.canReviewRevision('ADMIN', adminId, adminId)).toBe(false);
        });
        it('executes admin review decision successfully for third-party submissions', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/admin/reviews/decide')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ authorId: contributorId, decision: 'APPROVED' });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('decided');
        });
        it('rejects admin review decision when Admin attempts self-review', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/admin/reviews/decide')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ authorId: adminId, decision: 'APPROVED' });
            expect(res.status).toBe(403);
            expect(res.body.error.message).toContain('Author cannot review own submission');
        });
        it('allows Admin to assign valid active roles (ADMIN or CONTRIBUTOR)', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post(`/api/admin/users/${contributorId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'CONTRIBUTOR' });
            expect(res.status).toBe(200);
            expect(res.body.assignedRole).toBe('CONTRIBUTOR');
        });
    });
});
