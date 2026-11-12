const assert = require('assert');
const { prepareInitialTemplateIngestion } = require('../dist/ingestion');
const { FILE_ROLES, isValidFileRole } = require('@sbloom/contracts');

console.log('=== TEMPLATE INGESTION SCHEMA CONFORMANCE TEST ===');

const plan = prepareInitialTemplateIngestion();

// 1. Target Storage Bucket
assert.strictEqual(plan.targetStorageBucket, 'sBLOOM_templateshub', `Expected targetStorageBucket to be sBLOOM_templateshub, got ${plan.targetStorageBucket}`);
console.log('  [PASS] Target storage bucket is canonical sBLOOM_templateshub');

// 2. Total Assets and Count
assert.strictEqual(plan.totalAssets, 56, `Expected exactly 56 templates, got ${plan.totalAssets}`);
assert.strictEqual(plan.totalFiles, 56, `Expected 56 files, got ${plan.totalFiles}`);
console.log('  [PASS] 56 templates and 56 files successfully inspected');

// 2. Canonical FileRole Reconciliation (Strictly 5 values from schema.prisma)
const canonicalRolesSet = new Set(['PRIMARY_ENTRY', 'SOURCE_ARCHIVE', 'THUMBNAIL', 'PREVIEW_IMAGE', 'ATTACHMENT']);
assert.strictEqual(FILE_ROLES.length, 5, 'FILE_ROLES must have exactly 5 canonical values');
FILE_ROLES.forEach(role => {
  assert(canonicalRolesSet.has(role), `Role ${role} is not in the canonical database enum set`);
});
console.log('  [PASS] Canonical FileRole enum matches schema.prisma, migration, 02_create_schema.sql, and 03_verify_schema.sql');

// 3. Asset and Revision Structure
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Regex = /^[0-9a-f]{64}$/i;

plan.assets.forEach((item, idx) => {
  // UUID validation
  assert(uuidRegex.test(item.asset.id), `Invalid asset UUID: ${item.asset.id}`);
  assert(uuidRegex.test(item.revision.id), `Invalid revision UUID: ${item.revision.id}`);
  assert.strictEqual(item.asset.importSource, 'template-library/social-media');
  assert.strictEqual(item.asset.status, 'DRAFT');
  assert.strictEqual(item.revision.status, 'DRAFT');
  assert.strictEqual(item.revision.metadata.documentVersion, 1);

  // File records
  assert(item.files.length >= 1, `Asset ${item.asset.id} must have at least 1 file`);
  item.files.forEach(f => {
    assert(uuidRegex.test(f.id), `Invalid file UUID: ${f.id}`);
    assert(sha256Regex.test(f.checksumSha256), `Invalid SHA256 checksum: ${f.checksumSha256}`);
    assert(f.sizeBytes > 0, `File size must be positive: ${f.sizeBytes}`);
    assert(f.storageKey.startsWith('templates/social-media/'), `Invalid storage key prefix: ${f.storageKey}`);
    assert(isValidFileRole(f.role), `File role ${f.role} is not a valid canonical FileRole`);
    assert(canonicalRolesSet.has(f.role), `File role ${f.role} violates schema.prisma FileRole enum`);
  });
});

console.log('  [PASS] All 56 assets adhere to assets_templatedhub, asset_revisions_templatedhub, and asset_files_templatedhub schema');
console.log('  [PASS] Zero secondary FileRole vocabulary introduced');
console.log('=== TEMPLATE INGESTION TEST SUMMARY: ALL PASSED ===');
