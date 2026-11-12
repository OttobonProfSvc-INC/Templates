import { ISupabaseServerClient } from './types';
import { getSupabaseServerClient } from './client';
import { InternalError } from '../../common/errors';

/**
 * Resolved client execution context for repository operations.
 */
export type ResolvedClientContext =
  | { kind: 'supabase'; client: ISupabaseServerClient }
  | { kind: 'prisma'; client: any };

/**
 * Detects whether an object adheres to the Supabase client interface (has .from method).
 */
export function isSupabaseClient(client: unknown): client is ISupabaseServerClient {
  return (
    client !== null &&
    typeof client === 'object' &&
    typeof (client as any).from === 'function'
  );
}

/**
 * Detects whether an object is a Prisma Client or Prisma TransactionClient.
 * Prisma clients expose $queryRaw, $executeRaw, or model delegates (e.g. .asset, .user)
 * and do NOT expose .from.
 */
export function isPrismaClient(client: unknown): boolean {
  if (!client || typeof client !== 'object') {
    return false;
  }
  const c = client as any;
  // If the object provides .from, it is a Supabase client or PostgREST mock harness
  if (typeof c.from === 'function') {
    return false;
  }
  return (
    typeof c.$queryRaw === 'function' ||
    typeof c.$executeRaw === 'function' ||
    typeof c.$transaction === 'function' ||
    Boolean(c.asset && typeof c.asset.findUnique === 'function') ||
    Boolean(c.user && typeof c.user.findUnique === 'function') ||
    Boolean(c.assetRevision && typeof c.assetRevision.findUnique === 'function') ||
    Boolean(c.review && typeof c.review.findMany === 'function')
  );
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
export function resolveClientContext(
  context?: unknown,
  defaultSupabase?: ISupabaseServerClient
): ResolvedClientContext {
  // CASE A: No context supplied
  if (context === undefined || context === null) {
    return {
      kind: 'supabase',
      client: defaultSupabase || getSupabaseServerClient(),
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
  throw new InternalError('Unsupported database or client execution context');
}
