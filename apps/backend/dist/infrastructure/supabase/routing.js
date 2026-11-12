"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupabaseClient = isSupabaseClient;
exports.isPrismaClient = isPrismaClient;
exports.resolveClientContext = resolveClientContext;
const client_1 = require("./client");
const errors_1 = require("../../common/errors");
/**
 * Detects whether an object adheres to the Supabase client interface (has .from method).
 */
function isSupabaseClient(client) {
    return (client !== null &&
        typeof client === 'object' &&
        typeof client.from === 'function');
}
/**
 * Detects whether an object is a Prisma Client or Prisma TransactionClient.
 * Prisma clients expose $queryRaw, $executeRaw, or model delegates (e.g. .asset, .user)
 * and do NOT expose .from.
 */
function isPrismaClient(client) {
    if (!client || typeof client !== 'object') {
        return false;
    }
    const c = client;
    // If the object provides .from, it is a Supabase client or PostgREST mock harness
    if (typeof c.from === 'function') {
        return false;
    }
    return (typeof c.$queryRaw === 'function' ||
        typeof c.$executeRaw === 'function' ||
        typeof c.$transaction === 'function' ||
        Boolean(c.asset && typeof c.asset.findUnique === 'function') ||
        Boolean(c.user && typeof c.user.findUnique === 'function') ||
        Boolean(c.assetRevision && typeof c.assetRevision.findUnique === 'function') ||
        Boolean(c.review && typeof c.review.findMany === 'function'));
}
/**
 * Resolves repository client execution context with strict transaction-safety:
 *
 * CASE A: No context supplied (undefined/null) -> uses default or global server Supabase client.
 * CASE B: Supabase/PostgREST client supplied -> uses the supplied client.
 * CASE C: Prisma TransactionClient supplied -> uses the supplied Prisma transaction client.
 * CASE D: Unsupported context supplied -> throws InternalError safely.
 *
 * INVARIANT: A Prisma transaction-scoped read must NEVER silently fall back to the global Supabase client.
 */
function resolveClientContext(context, defaultSupabase) {
    // CASE A: No context supplied
    if (context === undefined || context === null) {
        return {
            kind: 'supabase',
            client: defaultSupabase || (0, client_1.getSupabaseServerClient)(),
        };
    }
    // CASE B: Supabase client supplied
    if (isSupabaseClient(context)) {
        return {
            kind: 'supabase',
            client: context,
        };
    }
    // CASE C: Prisma TransactionClient supplied
    if (isPrismaClient(context)) {
        return {
            kind: 'prisma',
            client: context,
        };
    }
    // CASE D: Unsupported context supplied
    throw new errors_1.InternalError('Unsupported database or client execution context');
}
