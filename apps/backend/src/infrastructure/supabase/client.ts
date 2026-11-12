import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';
import { SupabaseServerClientOptions } from './types';

let cachedClient: SupabaseClient | null = null;

/**
 * Validates that the supplied credential is not an unauthorized public/anon key.
 */
function assertPrivilegedServerKey(key: string): void {
  const lower = key.toLowerCase();
  if (
    lower.startsWith('anon') ||
    lower.includes('public-anon') ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && key === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim())
  ) {
    throw new Error(
      'Security error: Public anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) cannot be used as privileged backend credential. SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.'
    );
  }
}

/**
 * Creates a server-only Supabase client instance.
 * 
 * Strict architectural boundaries:
 * 1. Server-only execution: PersistSession, AutoRefreshToken, and DetectSessionInUrl are strictly false.
 * 2. Never exposes or logs secret credentials.
 * 3. Lazy creation: does not perform network calls upon construction.
 * 4. Supports Data API (.from), Stored Procedures (.rpc), and Storage (.storage).
 */
export function createSupabaseServerClient(
  options: SupabaseServerClientOptions = {}
): SupabaseClient {
  const url = options.supabaseUrl !== undefined ? options.supabaseUrl : config.supabaseUrl;
  const key = options.supabaseServiceRoleKey !== undefined ? options.supabaseServiceRoleKey : config.supabaseServiceRoleKey;

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw new Error(
      'Supabase client initialization failed: Missing required SUPABASE_URL configuration.'
    );
  }

  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new Error(
      'Supabase client initialization failed: Missing required privileged server key (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY).'
    );
  }

  assertPrivilegedServerKey(key);

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(options.schema ? { db: { schema: options.schema as any } } : {}),
  });

  return client;
}

/**
 * Resolves the shared server-only Supabase client singleton.
 * Uses lazy instantiation so modules importing this file do not trigger initialization until first called.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createSupabaseServerClient();
  }
  return cachedClient;
}

/**
 * Overrides the cached client singleton (for testing / mocking).
 */
export function setSupabaseServerClient(client: SupabaseClient | null): void {
  cachedClient = client;
}

/**
 * Resets the cached client singleton.
 */
export function resetSupabaseServerClient(): void {
  cachedClient = null;
}
