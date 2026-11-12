import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase Client configuration options.
 */
export interface SupabaseServerClientOptions {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  schema?: string;
}

/**
 * Type alias for the authoritative Supabase client.
 * Strictly server-only; must never be exposed or sent to frontend.
 */
export type ISupabaseServerClient = SupabaseClient;
