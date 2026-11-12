"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupabaseServerClient = createSupabaseServerClient;
exports.getSupabaseServerClient = getSupabaseServerClient;
exports.setSupabaseServerClient = setSupabaseServerClient;
exports.resetSupabaseServerClient = resetSupabaseServerClient;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../../config/env");
let cachedClient = null;
/**
 * Validates that the supplied credential is not an unauthorized public/anon key.
 */
function assertPrivilegedServerKey(key) {
    const lower = key.toLowerCase();
    if (lower.startsWith('anon') ||
        lower.includes('public-anon') ||
        (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && key === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim())) {
        throw new Error('Security error: Public anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) cannot be used as privileged backend credential. SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.');
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
function createSupabaseServerClient(options = {}) {
    const url = options.supabaseUrl !== undefined ? options.supabaseUrl : env_1.config.supabaseUrl;
    const key = options.supabaseServiceRoleKey !== undefined ? options.supabaseServiceRoleKey : env_1.config.supabaseServiceRoleKey;
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
        throw new Error('Supabase client initialization failed: Missing required SUPABASE_URL configuration.');
    }
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
        throw new Error('Supabase client initialization failed: Missing required privileged server key (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY).');
    }
    assertPrivilegedServerKey(key);
    const client = (0, supabase_js_1.createClient)(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        ...(options.schema ? { db: { schema: options.schema } } : {}),
    });
    return client;
}
/**
 * Resolves the shared server-only Supabase client singleton.
 * Uses lazy instantiation so modules importing this file do not trigger initialization until first called.
 */
function getSupabaseServerClient() {
    if (!cachedClient) {
        cachedClient = createSupabaseServerClient();
    }
    return cachedClient;
}
/**
 * Overrides the cached client singleton (for testing / mocking).
 */
function setSupabaseServerClient(client) {
    cachedClient = client;
}
/**
 * Resets the cached client singleton.
 */
function resetSupabaseServerClient() {
    cachedClient = null;
}
