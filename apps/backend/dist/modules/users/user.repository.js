"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = exports.UserRepository = void 0;
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const contracts_1 = require("@sbloom/contracts");
const supabase_1 = require("../../infrastructure/supabase");
const errors_1 = require("../../common/errors");
// Canonical UUID format (RFC 4122)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Data access repository for authoritative user identity and role resolution.
 * Normal runtime executes reads directly via the server-side PostgreSQL database layer.
 * Preserves Supabase Data API (PostgREST) support when explicitly injected for testing.
 */
class UserRepository {
    prismaClient;
    supabaseClient;
    constructor(client, supabaseClient) {
        if (client && typeof client.from === 'function') {
            this.supabaseClient = client;
        }
        else {
            this.prismaClient = client;
            this.supabaseClient = supabaseClient;
        }
    }
    resolveClient(tx) {
        if (tx !== undefined && tx !== null) {
            if ((0, supabase_1.isPrismaClient)(tx)) {
                return { kind: 'prisma', client: tx };
            }
            if ((0, supabase_1.isSupabaseClient)(tx)) {
                return { kind: 'supabase', client: tx };
            }
            throw new errors_1.InternalError('Unsupported database or client execution context');
        }
        if (this.supabaseClient) {
            return { kind: 'supabase', client: this.supabaseClient };
        }
        if (env_1.config.supabaseServiceRoleKey) {
            return { kind: 'supabase', client: (0, supabase_1.getSupabaseServerClient)() };
        }
        return {
            kind: 'prisma',
            client: this.prismaClient || (0, database_1.getDatabaseClient)(),
        };
    }
    /**
     * Resolves the authoritative application user identity directly from users_templatedhub.
     * Accepts verified identity subject (UUID).
     *
     * Returns only minimal authoritative identity context: id, role, isActive.
     * Callers cannot supply or influence the role.
     */
    async findAuthUserById(subjectId, tx) {
        if (!subjectId || typeof subjectId !== 'string') {
            return null;
        }
        const trimmedId = subjectId.trim();
        // In PostgreSQL, users_templatedhub.id is a UUID column.
        // If subjectId is not a valid UUID string, no corresponding record can exist.
        if (!UUID_REGEX.test(trimmedId)) {
            return null;
        }
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const user = await resolved.client.user.findUnique({
                where: { id: trimmedId },
                select: { id: true, role: true, isActive: true },
            });
            if (!user) {
                return null;
            }
            if (!(0, contracts_1.isValidUserRole)(user.role)) {
                return null;
            }
            return {
                id: user.id,
                role: user.role,
                isActive: Boolean(user.isActive),
            };
        }
        const { data, error } = await resolved.client
            .from('users_templatedhub')
            .select('id, role, is_active')
            .eq('id', trimmedId)
            .maybeSingle();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `UserRepository.findAuthUserById(${trimmedId})`);
        }
        if (!data) {
            return null;
        }
        if (!(0, contracts_1.isValidUserRole)(data.role)) {
            return null;
        }
        return (0, supabase_1.mapUserAuthContext)(data);
    }
    /**
     * Resolves the authoritative application user identity by normalized email.
     * Performs case-insensitive matching against users_templatedhub.email.
     *
     * Returns only minimal authoritative identity context: id, role, isActive.
     * Callers cannot supply or influence the role.
     */
    async findAuthUserByEmail(email, tx) {
        if (!email || typeof email !== 'string') {
            return null;
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (normalizedEmail.length === 0) {
            return null;
        }
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const user = await resolved.client.user.findFirst({
                where: {
                    email: {
                        equals: normalizedEmail,
                        mode: 'insensitive',
                    },
                },
                select: { id: true, role: true, isActive: true },
            });
            if (!user) {
                return null;
            }
            if (!(0, contracts_1.isValidUserRole)(user.role)) {
                return null;
            }
            return {
                id: user.id,
                role: user.role,
                isActive: Boolean(user.isActive),
            };
        }
        const { data, error } = await resolved.client
            .from('users_templatedhub')
            .select('id, role, is_active')
            .ilike('email', normalizedEmail)
            .maybeSingle();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `UserRepository.findAuthUserByEmail(${normalizedEmail})`);
        }
        if (!data) {
            return null;
        }
        if (!(0, contracts_1.isValidUserRole)(data.role)) {
            return null;
        }
        return (0, supabase_1.mapUserAuthContext)(data);
    }
    /**
     * Resolves the authoritative application user identity by email (preferred) or subject UUID.
     * Ensures stable normalized identity mapping without assuming client/NextAuth IDs match PostgreSQL UUIDs.
     */
    async findAuthUserByIdOrEmail(identifier, email, tx) {
        // 1. If email is provided, resolve by stable normalized email first
        if (email && typeof email === 'string' && email.trim().length > 0) {
            const userByEmail = await this.findAuthUserByEmail(email, tx);
            if (userByEmail) {
                return userByEmail;
            }
        }
        // 2. Fall back to identifier lookup
        if (identifier && typeof identifier === 'string' && identifier.trim().length > 0) {
            return this.findAuthUserById(identifier, tx);
        }
        return null;
    }
}
exports.UserRepository = UserRepository;
exports.userRepository = new UserRepository();
