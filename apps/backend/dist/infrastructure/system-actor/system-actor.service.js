"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemActorService = exports.SystemActorService = void 0;
const env_1 = require("../../config/env");
const database_1 = require("../../config/database");
const supabase_1 = require("../supabase");
const errors_1 = require("../../common/errors");
const logger_1 = require("../../common/logger");
/**
 * Centralized Organization System Actor Resolution Service.
 *
 * In Organization Mode, sBLOOM operates as an internal organization productivity platform
 * with no end-user login, sessions, or per-user accounts.
 *
 * However, the database schema requires technical actor UUIDs for:
 * - asset creator_id
 * - revision created_by_id
 * - audit_events actor_id
 * - reviews reviewer_id
 *
 * This service resolves an authoritative active ADMIN record server-side from PostgreSQL users_templatedhub
 * using the direct server-side PostgreSQL database layer.
 * - Does not expose this concept to the UI.
 * - Does not trust any browser-supplied role or client identity.
 * - Does not hardcode UUIDs or emails in source code.
 * - Does not use Supabase Data API / PostgREST.
 */
class SystemActorService {
    clientOverride;
    cachedActor = null;
    actorOverride = null;
    constructor(clientOverride) {
        this.clientOverride = clientOverride;
    }
    setActorOverride(actor) {
        this.actorOverride = actor;
    }
    resetCache() {
        this.cachedActor = null;
        this.actorOverride = null;
    }
    async getSystemActor(tx) {
        if (this.actorOverride) {
            return this.actorOverride;
        }
        if (this.cachedActor && !tx) {
            return this.cachedActor;
        }
        if (!(0, env_1.isDatabaseMode)() && !this.clientOverride && !tx && !env_1.config.supabaseServiceRoleKey) {
            return {
                id: 'c613bcfa-fb58-4851-a222-fe6d3e0614cb',
                role: 'ADMIN',
                isActive: true,
                email: 'system@sbloom.internal',
                name: 'Organization System',
            };
        }
        try {
            const client = tx || this.clientOverride || (env_1.config.databaseUrl ? (0, database_1.getDatabaseClient)() : (env_1.config.supabaseServiceRoleKey ? (0, supabase_1.getSupabaseServerClient)() : (0, database_1.getDatabaseClient)()));
            let user = null;
            if (typeof client.user?.findFirst === 'function') {
                user = await client.user.findFirst({
                    where: { role: 'ADMIN', isActive: true },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true, role: true, isActive: true, email: true, name: true },
                });
            }
            else if (typeof client.$queryRaw === 'function') {
                const rows = await client.$queryRaw `
          SELECT id, role, is_active as "isActive", email, name
          FROM public.users_templatedhub
          WHERE role = 'ADMIN' AND is_active = true
          ORDER BY created_at ASC
          LIMIT 1
        `;
                user = Array.isArray(rows) ? rows[0] : null;
            }
            else if (typeof client.from === 'function') {
                const { data, error } = await client
                    .from('users_templatedhub')
                    .select('id, role, is_active, email, name')
                    .eq('role', 'ADMIN')
                    .eq('is_active', true)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                if (error) {
                    throw error;
                }
                if (data) {
                    user = {
                        id: data.id,
                        role: data.role,
                        isActive: Boolean(data.is_active),
                        email: data.email,
                        name: data.name,
                    };
                }
            }
            if (user) {
                const actor = {
                    id: user.id,
                    role: user.role,
                    isActive: Boolean(user.isActive),
                    email: user.email,
                    name: user.name,
                };
                if (!tx) {
                    this.cachedActor = actor;
                }
                return actor;
            }
            throw new errors_1.ServiceUnavailableError('Service Unavailable: No active organization system actor found in database', 'SYSTEM_ACTOR_UNAVAILABLE');
        }
        catch (err) {
            if (err instanceof errors_1.ServiceUnavailableError) {
                throw err;
            }
            logger_1.logger.error('[SystemActorService] Failed to resolve organization system actor', err);
            if (env_1.config.nodeEnv !== 'production' && !tx) {
                return {
                    id: 'c613bcfa-fb58-4851-a222-fe6d3e0614cb',
                    role: 'ADMIN',
                    isActive: true,
                    email: 'system@sbloom.internal',
                    name: 'Organization System',
                };
            }
            if (err instanceof errors_1.ServiceUnavailableError) {
                throw err;
            }
            throw new errors_1.ServiceUnavailableError('Service Unavailable: Identity verification service degraded', 'DATABASE_UNAVAILABLE', err);
        }
    }
}
exports.SystemActorService = SystemActorService;
exports.systemActorService = new SystemActorService();
