"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActorValidationService = void 0;
const supabase_1 = require("../supabase");
// RFC 4122 canonical UUID format regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class ActorValidationService {
    clientOverride;
    constructor(clientOverride) {
        this.clientOverride = clientOverride;
    }
    resolveClient() {
        return this.clientOverride || (0, supabase_1.getSupabaseServerClient)();
    }
    /**
     * Validates an ingestion actor ID against the authoritative database via PostgREST Data API.
     * Enforces:
     * 1. Syntactically valid UUID
     * 2. User exists in users_templatedhub
     * 3. User is_active = true
     * 4. User role = ADMIN
     *
     * Returns authoritative ActorValidationResult without trusting caller-supplied roles.
     */
    async validateIngestionActor(actorId) {
        if (!actorId || typeof actorId !== 'string') {
            return {
                valid: false,
                code: 'INVALID_UUID',
                message: 'Actor ID must be a non-empty string.',
            };
        }
        const trimmedId = actorId.trim();
        // 1. Syntactically valid UUID check
        if (!UUID_REGEX.test(trimmedId)) {
            return {
                valid: false,
                code: 'INVALID_UUID',
                message: `Actor ID "${actorId}" is not a syntactically valid RFC 4122 UUID.`,
            };
        }
        // 2. Query user record from authoritative PostgREST Data API
        const client = this.resolveClient();
        const { data: user, error } = await client
            .from('users_templatedhub')
            .select('id, email, name, role, is_active')
            .eq('id', trimmedId)
            .maybeSingle();
        if (error) {
            throw (0, supabase_1.handlePostgrestError)(error, `ActorValidationService.validateIngestionActor(${trimmedId})`);
        }
        if (!user) {
            return {
                valid: false,
                code: 'USER_NOT_FOUND',
                message: `No user record found in database matching actor ID "${trimmedId}".`,
            };
        }
        const isActive = Boolean(user.is_active ?? user.isActive);
        const role = String(user.role);
        // 3. Active status check
        if (!isActive) {
            return {
                valid: false,
                code: 'USER_INACTIVE',
                message: `User "${user.name}" (${user.email}, id: ${user.id}) exists but is deactivated (is_active = false).`,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role,
                    isActive: false,
                },
            };
        }
        // 4. Role check (must be ADMIN)
        if (role !== 'ADMIN') {
            return {
                valid: false,
                code: 'USER_NOT_ADMIN',
                message: `User "${user.name}" (${user.email}, id: ${user.id}) has role "${role}", but ADMIN role is required for ingestion actor.`,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role,
                    isActive: true,
                },
            };
        }
        // 5. All validation checks passed
        return {
            valid: true,
            code: 'VALID_ADMIN',
            message: `Authoritative active ADMIN actor verified: "${user.name}" <${user.email}> (${user.id}).`,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role,
                isActive: true,
            },
        };
    }
}
exports.ActorValidationService = ActorValidationService;
