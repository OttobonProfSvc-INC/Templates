"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.resolveSupabaseServiceKey = resolveSupabaseServiceKey;
exports.isDatabaseMode = isDatabaseMode;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Centralized environment loading for sBLOOM backend:
// Resolves .env relative to the backend package root directory (__dirname/../../.env),
// ensuring configuration is reliably detected whether executed from the repository
// root (e.g. npm --prefix apps/backend run ...) or from within apps/backend.
const backendEnvPath = path_1.default.resolve(__dirname, '../../.env');
dotenv_1.default.config({ path: backendEnvPath });
dotenv_1.default.config(); // Fallback to process.cwd()/.env if present
// Ensure DATABASE_URL is normalized if provided in lowercase (database_url)
if (!process.env.DATABASE_URL && process.env.database_url) {
    process.env.DATABASE_URL = process.env.database_url;
}
/**
 * Resolves the backend-only privileged Supabase service credential.
 *
 * Strict Precedence:
 * 1. SUPABASE_SECRET_KEY (modern standard)
 * 2. SUPABASE_SERVICE_ROLE_KEY (legacy standard)
 *
 * Strict Security Invariant:
 * NEXT_PUBLIC_SUPABASE_ANON_KEY must NEVER be accepted as a privileged backend credential.
 */
function resolveSupabaseServiceKey() {
    const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
    if (secretKey && secretKey.length > 0) {
        return secretKey;
    }
    const legacyKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (legacyKey && legacyKey.length > 0) {
        return legacyKey;
    }
    return undefined;
}
function parsePort(val, defaultPort = 3001) {
    if (!val)
        return defaultPort;
    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid PORT configuration: "${val}". Must be a valid integer between 1 and 65535.`);
    }
    return parsed;
}
function validateAndBuildConfig() {
    const nodeEnv = (process.env.NODE_ENV || 'development');
    const port = parsePort(process.env.PORT, 3001);
    const internalApiPublicKey = process.env.INTERNAL_API_PUBLIC_KEY;
    const internalJwtIssuer = process.env.INTERNAL_JWT_ISSUER || 'sbloom-bff';
    const internalJwtAudience = process.env.INTERNAL_JWT_AUDIENCE || 'sbloom-backend';
    const databaseUrl = process.env.DATABASE_URL || process.env.database_url;
    const directUrl = process.env.DIRECT_URL || process.env.direct_url;
    const storageBucket = process.env.SBLOOM_STORAGE_BUCKET || 'sBLOOM_templateshub';
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseServiceRoleKey = resolveSupabaseServiceKey();
    const hasDbUrl = Boolean(databaseUrl && databaseUrl.trim().length > 0);
    const hasSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
    const useDatabaseStorage = process.env.USE_DATABASE_STORAGE === 'true' && (hasDbUrl || hasSupabase);
    // Obvious non-PEM / URL public-key misuse check
    if (internalApiPublicKey && internalApiPublicKey.trim().length > 0) {
        const trimmed = internalApiPublicKey.trim();
        if (trimmed.startsWith('http://') ||
            trimmed.startsWith('https://') ||
            trimmed.startsWith('postgres://') ||
            trimmed.startsWith('postgresql://')) {
            throw new Error('Configuration error: INTERNAL_API_PUBLIC_KEY must contain an RSA SPKI public key in PEM format (e.g. starting with "-----BEGIN PUBLIC KEY-----"). URL or database connection string was provided.');
        }
    }
    // Production-only fail-fast assertions
    if (nodeEnv === 'production') {
        if (!internalApiPublicKey || internalApiPublicKey.trim().length === 0) {
            throw new Error('FATAL CONFIGURATION ERROR: Missing required INTERNAL_API_PUBLIC_KEY in production mode. ' +
                'Backend cannot verify internal BFF signatures without public key.');
        }
        if (!useDatabaseStorage || !databaseUrl || databaseUrl.trim().length === 0) {
            throw new Error('FATAL CONFIGURATION ERROR: Production mode requires database persistence. ' +
                'Set USE_DATABASE_STORAGE=true and configure DATABASE_URL.');
        }
    }
    if (supabaseUrl && !supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
        throw new Error('Configuration error: SUPABASE_URL must be a valid HTTP or HTTPS URL (e.g. "https://xyz.supabase.co").');
    }
    return {
        nodeEnv,
        port,
        internalApiPublicKey,
        internalJwtIssuer,
        internalJwtAudience,
        databaseUrl,
        directUrl,
        storageBucket,
        useDatabaseStorage,
        supabaseUrl,
        supabaseServiceRoleKey,
    };
}
exports.config = validateAndBuildConfig();
function isDatabaseMode() {
    const hasDb = Boolean(exports.config.databaseUrl && exports.config.databaseUrl.trim().length > 0);
    const hasSupabase = Boolean(exports.config.supabaseUrl && exports.config.supabaseServiceRoleKey);
    return (hasDb || hasSupabase) && (exports.config.nodeEnv === 'production' || exports.config.useDatabaseStorage);
}
