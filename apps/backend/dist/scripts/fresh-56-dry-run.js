"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../infrastructure/supabase/client");
const ingestion_1 = require("../infrastructure/ingestion");
async function main() {
    console.log('=== FRESH DRY-RUN FOR 56 TEMPLATES AGAINST REAL SUPABASE DATABASE ===');
    const client = (0, client_1.getSupabaseServerClient)();
    // 1. Discover all local templates
    const libraryRoot = path_1.default.resolve(process.cwd(), '../../template-library/social-media');
    const altRoot = path_1.default.resolve(process.cwd(), 'template-library/social-media');
    const realRoot = fs_1.default.existsSync(libraryRoot) ? libraryRoot : altRoot;
    const discovery = (0, ingestion_1.discoverLocalTemplates)(realRoot);
    console.log(`Discovered ${discovery.totalDiscovered} local templates (expected ${ingestion_1.EXPECTED_TOTAL_TEMPLATES}).`);
    console.log('Category breakdown:');
    console.log(`  - Coaching: ${discovery.categoryCounts.coaching}`);
    console.log(`  - Colleges: ${discovery.categoryCounts.colleges}`);
    console.log(`  - Schools:  ${discovery.categoryCounts.schools}`);
    // 2. Query real Supabase database for existing records
    const { data: dbAssets, error: assetErr } = await client
        .from('assets_templatedhub')
        .select('id, slug, legacy_id, status, current_published_revision_id, created_at');
    if (assetErr) {
        throw new Error(`Failed to query assets_templatedhub: ${assetErr.message}`);
    }
    const { data: dbFiles, error: fileErr } = await client
        .from('asset_files_templatedhub')
        .select('id, revision_id, storage_key, file_name, checksum_sha256, size_bytes');
    if (fileErr) {
        throw new Error(`Failed to query asset_files_templatedhub: ${fileErr.message}`);
    }
    console.log(`\nReal Database Inventory:`);
    console.log(`  - assets_templatedhub count: ${dbAssets?.length || 0}`);
    console.log(`  - asset_files_templatedhub count: ${dbFiles?.length || 0}`);
    const existingSlugMap = new Map((dbAssets || []).map((a) => [a.slug, a]));
    const existingStorageKeyMap = new Map((dbFiles || []).map((f) => [f.storage_key, f]));
    // 3. Evaluate each of the 56 templates against real DB
    let existingCount = 0;
    let missingCount = 0;
    let collisionCount = 0;
    const existingItems = [];
    const missingItems = [];
    const collisionItems = [];
    // Group files by category to calculate category indices
    const categoryIndices = {};
    for (const file of discovery.files) {
        const cat = file.sourceCategoryKey;
        categoryIndices[cat] = (categoryIndices[cat] || 0) + 1;
        const catIndex = categoryIndices[cat];
        const slug = `${cat}-post-${catIndex}`;
        const safeFileName = file.originalFileName.replace(/\s+/g, '-').toLowerCase();
        const expectedStorageKey = `templates/social-media/${cat}/${file.originalFileName}`;
        const fileBuf = fs_1.default.readFileSync(file.absolutePath);
        const localSha = crypto_1.default.createHash('sha256').update(fileBuf).digest('hex');
        const matchingAsset = existingSlugMap.get(slug);
        const matchingFile = existingStorageKeyMap.get(expectedStorageKey);
        if (matchingAsset || matchingFile) {
            // Check collision
            if (matchingFile && matchingFile.checksum_sha256.toLowerCase() !== localSha.toLowerCase()) {
                collisionCount++;
                collisionItems.push({
                    slug,
                    fileName: file.originalFileName,
                    expectedKey: expectedStorageKey,
                    reason: `Storage key matches but SHA-256 differs (local: ${localSha}, remote: ${matchingFile.checksum_sha256})`,
                });
            }
            else {
                existingCount++;
                existingItems.push({
                    slug,
                    assetId: matchingAsset?.id,
                    status: matchingAsset?.status,
                    fileName: file.originalFileName,
                    storageKey: matchingFile?.storage_key || expectedStorageKey,
                    sha256: localSha,
                });
            }
        }
        else {
            missingCount++;
            missingItems.push({
                slug,
                category: file.sourceCategory,
                fileName: file.originalFileName,
                sizeBytes: fileBuf.length,
                sha256: localSha,
            });
        }
    }
    console.log(`\n=== 56-TEMPLATE RECONCILIATION SUMMARY ===`);
    console.log(`  - Total templates evaluated: ${discovery.totalDiscovered}`);
    console.log(`  - Existing in database:       ${existingCount}`);
    console.log(`  - Missing from database:      ${missingCount}`);
    console.log(`  - Collisions detected:        ${collisionCount}`);
    if (existingItems.length > 0) {
        console.log(`\nExisting template detail:`);
        existingItems.forEach((it) => {
            console.log(`  * ${it.slug} (Asset ID: ${it.assetId}, Status: ${it.status}, Key: ${it.storageKey})`);
        });
    }
    console.log(`\nMissing template count by category:`);
    const missingByCat = {};
    missingItems.forEach((it) => {
        missingByCat[it.category] = (missingByCat[it.category] || 0) + 1;
    });
    Object.entries(missingByCat).forEach(([cat, count]) => {
        console.log(`  * ${cat}: ${count} missing`);
    });
    return {
        total: discovery.totalDiscovered,
        existing: existingCount,
        missing: missingCount,
        collisions: collisionCount,
        existingItems,
        missingItemsCountByCategory: missingByCat,
    };
}
main().catch((err) => {
    console.error('[FATAL DRY-RUN ERROR]', err);
    process.exit(1);
});
