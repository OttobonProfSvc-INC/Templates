"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOrganizationContext = exports.requireInternalAuth = void 0;
const jose_1 = require("jose");
const contracts_1 = require("@sbloom/contracts");
const env_1 = require("../config/env");
const user_repository_1 = require("../modules/users/user.repository");
const system_actor_1 = require("../infrastructure/system-actor");
const errors_1 = require("../common/errors");
const logger_1 = require("../common/logger");
__exportStar(require("./authorization"), exports);
/**
 * Authoritative Internal Authentication Middleware.
 *
 * Cryptographically verifies RS256 internal JWT issued by the trusted Next.js BFF.
 * The JWT proves request origin and subject identity, but is NEVER the authoritative source for application role or active status.
 *
 * In database-backed application mode:
 * - If verified sub is a service identifier (e.g. 'sbloom-bff'), resolves the authoritative organization system actor.
 * - Otherwise, resolves against PostgreSQL users_templatedhub via UserRepository.
 * - Missing or inactive users are rejected with HTTP 403.
 * - Database connectivity failures return HTTP 503 and NEVER fall back to JWT claims.
 */
const requireInternalAuth = async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        next(new errors_1.UnauthorizedError('Missing or invalid Authorization header'));
        return;
    }
    const token = authHeader.split(' ')[1];
    if (!token || token.trim().length === 0) {
        next(new errors_1.UnauthorizedError('Missing token in Authorization header'));
        return;
    }
    let verifiedSub;
    let payloadRole;
    let payloadIsActive;
    let payloadEmail;
    try {
        const publicKey = env_1.config.internalApiPublicKey;
        if (!publicKey) {
            logger_1.logger.error('[Auth] Server misconfiguration: Missing INTERNAL_API_PUBLIC_KEY');
            next(new errors_1.InternalError('Internal Server Error'));
            return;
        }
        const alg = 'RS256';
        let spki;
        try {
            spki = await (0, jose_1.importSPKI)(publicKey, alg);
        }
        catch (keyErr) {
            logger_1.logger.error('[Auth] Server misconfiguration: Invalid INTERNAL_API_PUBLIC_KEY format', undefined, {
                errorName: keyErr.name,
            });
            next(new errors_1.InternalError('Internal Server Error'));
            return;
        }
        const { payload } = await (0, jose_1.jwtVerify)(token, spki, {
            issuer: env_1.config.internalJwtIssuer,
            audience: env_1.config.internalJwtAudience,
            algorithms: ['RS256'],
            maxTokenAge: '15s',
        });
        if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
            next(new errors_1.UnauthorizedError('Missing subject in token'));
            return;
        }
        if (!payload.jti) {
            next(new errors_1.UnauthorizedError('Missing jti in token'));
            return;
        }
        verifiedSub = payload.sub.trim();
        payloadRole = typeof payload.role === 'string' ? payload.role : undefined;
        payloadIsActive = typeof payload.isActive === 'boolean' ? payload.isActive : undefined;
        payloadEmail = typeof payload.email === 'string' && payload.email.trim().length > 0
            ? payload.email.trim().toLowerCase()
            : undefined;
    }
    catch (error) {
        next(new errors_1.UnauthorizedError('Unauthorized', error));
        return;
    }
    // Determine persistence mode
    const isDbMode = (0, env_1.isDatabaseMode)();
    if (isDbMode) {
        try {
            let dbUser = await user_repository_1.userRepository.findAuthUserByIdOrEmail(verifiedSub, payloadEmail);
            // In Organization Mode, if verifiedSub is a BFF service token or general request without individual user
            if (!dbUser && (verifiedSub === 'sbloom-bff' || verifiedSub === 'sbloom-system')) {
                try {
                    dbUser = await system_actor_1.systemActorService.getSystemActor();
                }
                catch {
                    // Fall through to standard validation check below
                }
            }
            if (!dbUser) {
                next(new errors_1.ForbiddenError('Forbidden: No corresponding application user found'));
                return;
            }
            if (!dbUser.isActive) {
                next(new errors_1.ForbiddenError('Forbidden: User account is inactive'));
                return;
            }
            if (!(0, contracts_1.isValidUserRole)(dbUser.role)) {
                next(new errors_1.ForbiddenError('Forbidden: Invalid user role in database'));
                return;
            }
            // Authoritative identity context populated strictly from PostgreSQL users_templatedhub
            req.user = {
                id: dbUser.id,
                role: dbUser.role,
                isActive: true,
            };
            next();
            return;
        }
        catch (dbError) {
            logger_1.logger.error('[Auth] Database error during authoritative user lookup', dbError, { sub: verifiedSub, email: payloadEmail });
            next(new errors_1.ServiceUnavailableError('Service Unavailable: Identity verification service degraded', 'DATABASE_UNAVAILABLE', dbError));
            return;
        }
    }
    // Explicit In-Memory Development / Test Mode Compatibility
    const role = payloadRole && (0, contracts_1.isValidUserRole)(payloadRole) ? payloadRole : undefined;
    const isActive = payloadIsActive !== false;
    if (!isActive) {
        next(new errors_1.ForbiddenError('Forbidden: User account is inactive'));
        return;
    }
    req.user = {
        id: verifiedSub,
        role,
        isActive,
    };
    next();
};
exports.requireInternalAuth = requireInternalAuth;
/**
 * Organization Mode Request Middleware.
 *
 * Used for normal application routes (/api/templates, /api/my-work, /api/workspace, /api/customizations).
 * - Does NOT require end-user login, sessions, or accounts.
 * - Resolves the authoritative Organization System Actor server-side from PostgreSQL users_templatedhub.
 * - Never trusts any browser-supplied role or client identity.
 * - Validates internal Bearer token if present; permits normal application requests without token in organization mode.
 */
const resolveOrganizationContext = async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    // 1. If an internal token is provided by BFF, verify its validity
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token && token.trim().length > 0) {
            try {
                const publicKey = env_1.config.internalApiPublicKey;
                if (!publicKey) {
                    logger_1.logger.error('[Auth] Server misconfiguration: Missing INTERNAL_API_PUBLIC_KEY');
                    next(new errors_1.InternalError('Internal Server Error'));
                    return;
                }
                const alg = 'RS256';
                let spki;
                try {
                    spki = await (0, jose_1.importSPKI)(publicKey, alg);
                }
                catch (keyErr) {
                    logger_1.logger.error('[Auth] Server misconfiguration: Invalid INTERNAL_API_PUBLIC_KEY format');
                    next(new errors_1.InternalError('Internal Server Error'));
                    return;
                }
                await (0, jose_1.jwtVerify)(token, spki, {
                    issuer: env_1.config.internalJwtIssuer,
                    audience: env_1.config.internalJwtAudience,
                    algorithms: ['RS256'],
                    maxTokenAge: '15s',
                });
            }
            catch (jwtErr) {
                next(new errors_1.UnauthorizedError('Unauthorized: Invalid internal token', jwtErr));
                return;
            }
        }
    }
    // 2. Authoritatively resolve the Organization System Actor
    try {
        const actor = await system_actor_1.systemActorService.getSystemActor();
        req.user = {
            id: actor.id,
            role: actor.role,
            isActive: actor.isActive,
        };
        next();
    }
    catch (err) {
        next(err);
    }
};
exports.resolveOrganizationContext = resolveOrganizationContext;
