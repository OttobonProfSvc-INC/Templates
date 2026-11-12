"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteAdminReviewDecisionBodySchema = exports.RouteAdminAssetIdParamSchema = exports.RouteAdminUserIdParamSchema = exports.RouteCustomizationIdParamSchema = exports.RouteTemplateIdParamSchema = exports.RouteEntityIdSchema = void 0;
exports.validate = validate;
const zod_1 = require("zod");
const env_1 = require("../config/env");
const contracts_1 = require("@sbloom/contracts");
const errors_1 = require("../common/errors");
/**
 * Formats Zod issues into sanitized, client-safe error details.
 * Prevents leaking internal stack traces, database metadata, or secrets.
 */
function formatZodIssues(issues, prefix) {
    return issues.map((issue) => {
        let subPath = issue.path.join('.');
        if (!subPath && issue.keys && Array.isArray(issue.keys)) {
            subPath = issue.keys.join(', ');
        }
        const fullPath = subPath ? `${prefix}.${subPath}` : prefix;
        return {
            path: fullPath,
            message: issue.message,
        };
    });
}
/**
 * Environment-aware entity identifier schema:
 * - In database-backed mode (mandatory in production): strictly enforces UuidSchema.
 * - In explicit in-memory development/test mode: allows DevEntityIdSchema (tmpl-..., cust-..., admin-001).
 * Dynamically evaluates runtime persistence mode so non-UUID IDs cannot reach PostgreSQL queries in database mode.
 */
exports.RouteEntityIdSchema = zod_1.z.string().superRefine((val, ctx) => {
    const isDb = (0, env_1.isDatabaseMode)();
    const schema = (0, contracts_1.getEntityIdSchema)(isDb);
    const result = schema.safeParse(val);
    if (!result.success) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: isDb
                ? 'Invalid entity identifier: Database mode requires a valid UUID'
                : 'Invalid entity identifier: Must be alphanumeric with hyphens or underscores',
        });
    }
});
// Canonical route parameter schemas using environment-aware ID validation
exports.RouteTemplateIdParamSchema = zod_1.z.object({ id: exports.RouteEntityIdSchema }).strict();
exports.RouteCustomizationIdParamSchema = zod_1.z.object({ id: exports.RouteEntityIdSchema }).strict();
exports.RouteAdminUserIdParamSchema = zod_1.z.object({ userId: exports.RouteEntityIdSchema }).strict();
exports.RouteAdminAssetIdParamSchema = zod_1.z.object({ assetId: exports.RouteEntityIdSchema }).strict();
// Environment-aware admin review decision schema
exports.RouteAdminReviewDecisionBodySchema = zod_1.z
    .object({
    authorId: exports.RouteEntityIdSchema,
    decision: contracts_1.ReviewDecisionEnum,
})
    .strict();
/**
 * Generic Express validation middleware.
 * Validates params, query, and/or body before invoking subsequent middleware or route handlers.
 *
 * On success:
 * - Updates req.params, req.query, and req.body with the sanitized and normalized parsed data.
 * - Proceeds to next handler.
 *
 * On validation failure:
 * - Halts execution immediately.
 * - Returns HTTP 400 with a standard structured error payload.
 * - Never executes downstream business logic or database queries.
 */
function validate(schemas) {
    return (req, res, next) => {
        const details = [];
        if (schemas.params) {
            const result = schemas.params.safeParse(req.params);
            if (!result.success) {
                details.push(...formatZodIssues(result.error.issues, 'params'));
            }
            else {
                req.params = result.data;
            }
        }
        if (schemas.query) {
            const result = schemas.query.safeParse(req.query);
            if (!result.success) {
                details.push(...formatZodIssues(result.error.issues, 'query'));
            }
            else {
                req.query = result.data;
            }
        }
        if (schemas.body) {
            const result = schemas.body.safeParse(req.body);
            if (!result.success) {
                details.push(...formatZodIssues(result.error.issues, 'body'));
            }
            else {
                req.body = result.data;
            }
        }
        if (details.length > 0) {
            next(new errors_1.ValidationError('Request validation failed', details));
            return;
        }
        next();
    };
}
