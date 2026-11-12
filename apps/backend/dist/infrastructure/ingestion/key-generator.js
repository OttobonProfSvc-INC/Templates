"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_STORAGE_ROOT = exports.ALLOWED_INGESTION_CATEGORIES = void 0;
exports.assertSafePathString = assertSafePathString;
exports.normalizeFilenameSlug = normalizeFilenameSlug;
exports.generateStorageKey = generateStorageKey;
exports.resolveDeterministicStorageKeys = resolveDeterministicStorageKeys;
const path_1 = __importDefault(require("path"));
exports.ALLOWED_INGESTION_CATEGORIES = ['coaching', 'colleges', 'schools'];
exports.CANONICAL_STORAGE_ROOT = 'templates/social-media';
/**
 * Validates path security invariants:
 * - Reject absolute paths (POSIX / or Windows C:\)
 * - Reject path traversal (..)
 * - Reject Windows backslashes (\)
 */
function assertSafePathString(input, fieldName = 'path') {
    if (!input || typeof input !== 'string') {
        throw new Error(`Security validation failed: ${fieldName} must be a non-empty string.`);
    }
    if (input.includes('\\')) {
        throw new Error(`Security validation failed: Windows backslashes are prohibited in ${fieldName}: "${input}". Use forward slashes.`);
    }
    if (input.includes('..')) {
        throw new Error(`Security validation failed: Path traversal characters (..) are prohibited in ${fieldName}: "${input}".`);
    }
    if (path_1.default.posix.isAbsolute(input) || /^[a-zA-Z]:/.test(input)) {
        throw new Error(`Security validation failed: Absolute paths are prohibited in ${fieldName}: "${input}".`);
    }
}
/**
 * Normalizes a raw filename into a URL-safe, lowercase, alphanumeric slug.
 * - Strips emojis and non-ASCII characters.
 * - Converts spaces and underscores to hyphens.
 * - Removes unsafe punctuation.
 * - Collapses consecutive hyphens.
 * - Preserves normalized lowercase extension.
 */
function normalizeFilenameSlug(rawFileName, sha256Hex, forceDisambiguation) {
    assertSafePathString(rawFileName, 'fileName');
    const ext = path_1.default.extname(rawFileName).toLowerCase();
    const rawBase = path_1.default.basename(rawFileName, path_1.default.extname(rawFileName));
    // 1. Remove emojis and non-ASCII characters
    let slug = rawBase.replace(/[^\x00-\x7F]/g, '');
    // 2. Replace spaces and underscores with hyphens
    slug = slug.replace(/[\s_]+/g, '-');
    // 3. Keep only alphanumeric characters and hyphens
    slug = slug.replace(/[^a-zA-Z0-9-]/g, '');
    // 4. Convert to lowercase
    slug = slug.toLowerCase();
    // 5. Collapse multiple hyphens into one and trim edges
    slug = slug.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    // 6. Fallback if slug becomes completely empty (e.g. file was purely emojis/symbols)
    if (!slug) {
        const fallbackSuffix = sha256Hex ? sha256Hex.slice(0, 8) : 'asset';
        slug = `template-${fallbackSuffix}`;
    }
    // 7. Enforce safe max length for slug (60 chars)
    if (slug.length > 60) {
        slug = slug.slice(0, 60).replace(/-+$/, '');
    }
    // 8. Deterministic disambiguation suffix if requested (12 lowercase hex characters)
    if (forceDisambiguation && sha256Hex) {
        const hashSuffix = sha256Hex.slice(0, 12).toLowerCase();
        slug = `${slug}-${hashSuffix}`;
    }
    return `${slug}${ext}`;
}
/**
 * Generates the canonical, deterministic storage key for an asset file.
 * Structure: templates/social-media/{category}/{normalized-filename}
 */
function generateStorageKey(category, fileName, options = {}) {
    assertSafePathString(category, 'category');
    assertSafePathString(fileName, 'fileName');
    const normalizedCategory = category.trim().toLowerCase();
    if (!exports.ALLOWED_INGESTION_CATEGORIES.includes(normalizedCategory)) {
        throw new Error(`Invalid ingestion category: "${category}". Must be one of: ${exports.ALLOWED_INGESTION_CATEGORIES.join(', ')}`);
    }
    const normalizedFileName = normalizeFilenameSlug(fileName, options.sha256Hex, options.forceDisambiguation);
    return `${exports.CANONICAL_STORAGE_ROOT}/${normalizedCategory}/${normalizedFileName}`;
}
/**
 * Resolves storage keys for an entire batch of template files.
 * Detects intra-category normalization collisions (e.g. "My Post.jpg" and "My-Post.jpg" both becoming "my-post.jpg").
 * If a collision occurs within the same category, disambiguates deterministically using 12 characters of SHA-256.
 */
function resolveDeterministicStorageKeys(items) {
    const resolvedKeys = new Map(); // itemKey -> storageKey
    const seenCategorySlugs = new Map(); // "category:slug" -> itemIdentifier
    // Pass 1: Identify collisions
    const collidingItemKeys = new Set();
    for (const item of items) {
        const normalizedCategory = item.category.trim().toLowerCase();
        const baseSlug = normalizeFilenameSlug(item.fileName, item.checksumSha256, false);
        const lookupKey = `${normalizedCategory}:${baseSlug}`;
        const itemKey = `${item.category}/${item.fileName}`;
        if (seenCategorySlugs.has(lookupKey)) {
            collidingItemKeys.add(itemKey);
            collidingItemKeys.add(seenCategorySlugs.get(lookupKey));
        }
        else {
            seenCategorySlugs.set(lookupKey, itemKey);
        }
    }
    // Pass 2: Assign deterministic keys
    for (const item of items) {
        const itemKey = `${item.category}/${item.fileName}`;
        const isColliding = collidingItemKeys.has(itemKey);
        const key = generateStorageKey(item.category, item.fileName, {
            sha256Hex: item.checksumSha256,
            forceDisambiguation: isColliding,
        });
        resolvedKeys.set(itemKey, key);
    }
    return resolvedKeys;
}
