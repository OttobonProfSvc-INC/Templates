"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const contracts_1 = require("@sbloom/contracts");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../common/errors");
exports.adminRouter = (0, express_1.Router)();
// Internal token inspection endpoint
exports.adminRouter.get('/internal/whoami', auth_1.requireInternalAuth, (req, res) => {
    res.json({ id: req.user?.id, role: req.user?.role });
});
// Admin Review Decisions: Restricted to ADMIN only
// Note: Per Phase 4D/4F/4G, route remains stubbed pending API contract decision on authorId vs revision lookup
exports.adminRouter.post('/api/admin/reviews/decide', auth_1.requireInternalAuth, auth_1.requireAdmin, (0, validate_1.validate)({ body: validate_1.RouteAdminReviewDecisionBodySchema }), (req, res, next) => {
    const { authorId, decision } = req.body;
    if (!auth_1.Capabilities.canReviewRevision(req.user.role, authorId, req.user.id)) {
        next(new errors_1.ForbiddenError('Peer review violation: Author cannot review own submission.'));
        return;
    }
    res.json({ status: 'decided', reviewerId: req.user?.id, decision });
});
// Admin Role Assignment: Restricted to ADMIN only, rejects invalid/obsolete roles like VIEWER
exports.adminRouter.post('/api/admin/users/:userId/role', auth_1.requireInternalAuth, auth_1.requireAdmin, (0, validate_1.validate)({ params: validate_1.RouteAdminUserIdParamSchema, body: contracts_1.UpdateUserRoleRequestSchema }), (req, res) => {
    const { role } = req.body;
    res.json({ status: 'updated', userId: req.params.userId, assignedRole: role });
});
// Admin Purge: Restricted to ADMIN only
exports.adminRouter.post('/api/admin/purge/:assetId', auth_1.requireInternalAuth, auth_1.requireAdmin, (0, validate_1.validate)({ params: validate_1.RouteAdminAssetIdParamSchema }), (req, res) => {
    res.json({ status: 'purged', assetId: req.params.assetId });
});
