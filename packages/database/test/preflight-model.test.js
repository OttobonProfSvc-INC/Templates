// ==============================================================================
// sBLOOM Preflight Test Suite: Static Model & Verification Checks
// File: packages/database/test/preflight-model.test.js
// Purpose: Validates 01_preflight.sql against canonical sources:
//          1. Zero HTML entities (named and numeric) or Markdown SQL escapes
//          2. Complete enum CTE extraction for both Section 5 & Section 9 inventories
//          3. Both routine inventories (Section 6 & 9) match canonical signatures
//          4. Supported pg_has_role privilege forms ('MEMBER WITH ADMIN OPTION', 'SET')
//          5. Supported ownership transfer prerequisites (SET capability + CREATE on public)
//          6. Decision-tree verdict simulation covering negative and edge cases
// ==============================================================================

const fs = require('fs');
const path = require('path');

const PREFLIGHT_SQL_PATH = path.resolve(__dirname, '../supabase/01_preflight.sql');

if (!fs.existsSync(PREFLIGHT_SQL_PATH)) {
  console.error(`[FATAL] 01_preflight.sql not found at ${PREFLIGHT_SQL_PATH}`);
  process.exit(1);
}

const sqlContent = fs.readFileSync(PREFLIGHT_SQL_PATH, 'utf8');
let failureCount = 0;

function assertCheck(name, passed, detail = '') {
  if (passed) {
    console.log(`  [PASS] ${name}`);
  } else {
    console.error(`  [FAIL] ${name} ${detail ? '-> ' + detail : ''}`);
    failureCount++;
  }
}

// ==============================================================================
// TEST 1: STATIC CONTENT, ENCODING & DEMONSTRATED CORRUPTIONS
// ==============================================================================
console.log('=== TEST 1: STATIC CONTENT, ENCODING & DEMONSTRATED CORRUPTIONS ===');

// Check for named HTML entities
const namedEntityRegex = /&(?:[a-zA-Z]+);/g;
const foundNamedEntities = sqlContent.match(namedEntityRegex) || [];
assertCheck(
  'Zero named HTML entities in 01_preflight.sql',
  foundNamedEntities.length === 0,
  `Found: ${foundNamedEntities.join(', ')}`
);

// Check for numeric HTML entities (decimal &#NN; and hex &#xHH;)
const numericEntityRegex = /&#(?:x[0-9a-fA-F]+|[0-9]+);/g;
const foundNumericEntities = sqlContent.match(numericEntityRegex) || [];
assertCheck(
  'Zero numeric HTML entities in 01_preflight.sql',
  foundNumericEntities.length === 0,
  `Found: ${foundNumericEntities.join(', ')}`
);

// Check for Markdown SQL escapes (e.g. \_, \*, \`, \[, \])
const markdownEscapeRegex = /\\(?:[_#*`~[\]()])/g;
const foundMarkdownEscapes = sqlContent.match(markdownEscapeRegex) || [];
assertCheck(
  'Zero Markdown SQL escapes in 01_preflight.sql',
  foundMarkdownEscapes.length === 0,
  `Found: ${foundMarkdownEscapes.join(', ')}`
);

// Check for Markdown code fences
const fenceRegex = /(?:```|~~~)/g;
const foundFences = sqlContent.match(fenceRegex) || [];
assertCheck(
  'Zero Markdown code fences in 01_preflight.sql',
  foundFences.length === 0,
  `Found fences: ${foundFences.length}`
);

// Check for bare 'ADMIN OPTION' argument in pg_has_role
const hasBareAdminOption = /pg_has_role\([^)]*,\s*'ADMIN OPTION'\s*\)/i.test(sqlContent);
assertCheck(
  'Zero bare \'ADMIN OPTION\' privilege arguments in pg_has_role',
  !hasBareAdminOption,
  'Found invalid bare \'ADMIN OPTION\' syntax in pg_has_role'
);

// Check for explicit cast e.enumlabel::text in both array_agg calls
const arrayAggCasts = (sqlContent.match(/array_agg\(e\.enumlabel::text/g) || []).length;
assertCheck(
  'Explicit cast e.enumlabel::text present in both enum inventories (Section 5 and Section 9)',
  arrayAggCasts >= 2,
  `Found ${arrayAggCasts} instances (expected at least 2)`
);

// Check that data preservation policy is respected (no 'clean up orphaned tables')
const hasDestructiveCleanup = /clean up (orphaned|legacy) tables/i.test(sqlContent);
assertCheck(
  'Zero instructions to \'clean up orphaned tables\'',
  !hasDestructiveCleanup,
  'Found destructive cleanup instruction'
);

const hasPreserveDataPolicy = /preserve data/i.test(sqlContent);
assertCheck(
  'Data preservation policy explicitly present',
  hasPreserveDataPolicy,
  'Missing explicit preserve data directive'
);

// Check that unsupported "matches canonical" or "verified compatible" claims are removed
const hasUnsupportedRoutineClaim = /matches canonical definition|verified compatible/i.test(sqlContent);
assertCheck(
  'Zero unsupported "matches canonical" or "verified compatible" claims',
  !hasUnsupportedRoutineClaim,
  'Found unsupported routine claims'
);

// Check that absent routines evaluate to NULL, not SECURITY INVOKER
const absentRoutineNullCheck = /WHEN p\.oid IS NULL THEN NULL\s+WHEN p\.prosecdef THEN 'SECURITY DEFINER'\s+ELSE 'SECURITY INVOKER'/i.test(sqlContent);
assertCheck(
  'Absent routines evaluate to NULL, not SECURITY INVOKER',
  absentRoutineNullCheck,
  'Absent routine security attribute should be NULL'
);

// ==============================================================================
// TEST 2: BOTH ENUM INVENTORIES VALIDATION (Section 5 & Section 9)
// ==============================================================================
console.log('\n=== TEST 2: BOTH ENUM INVENTORIES VALIDATION (Section 5 & Section 9) ===');

const CANONICAL_ENUMS = {
  UserRole: ['ADMIN', 'CONTRIBUTOR'],
  AssetStatus: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  RevisionStatus: ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED'],
  FileRole: ['PRIMARY_ENTRY', 'SOURCE_ARCHIVE', 'THUMBNAIL', 'PREVIEW_IMAGE', 'ATTACHMENT'],
  ReviewDecision: ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'],
  UsageAction: ['VIEW', 'DOWNLOAD', 'PREVIEW', 'REMIX'],
  JobStatus: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']
};

// Extract entire expected_enums CTE blocks (delimited between AS (VALUES ... ) and the next CTE actual_types)
const enumBlockRegex = /expected_enums\s*\([^)]+\)\s*AS\s*\(\s*VALUES([\s\S]*?)\n\s*\),?\s*actual_types/gi;
const enumBlocks = [];
let blockMatch;
while ((blockMatch = enumBlockRegex.exec(sqlContent)) !== null) {
  enumBlocks.push(blockMatch[1]);
}

assertCheck(
  'Exactly two expected_enums CTE blocks found (Section 5 and Section 9)',
  enumBlocks.length === 2,
  `Found ${enumBlocks.length} blocks`
);

enumBlocks.forEach((block, blockIdx) => {
  const sectionNum = blockIdx === 0 ? 5 : 9;
  const tupleRegex = /\(\s*'([A-Za-z0-9_]+)'\s*,\s*ARRAY\[([^\]]+)\]::text\[\]\s*\)/g;
  const parsedEnums = {};
  let tm;
  while ((tm = tupleRegex.exec(block)) !== null) {
    const enumName = tm[1];
    const labels = tm[2].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    parsedEnums[enumName] = labels;
  }

  // Explicit validation: exactly two product roles, no VIEWER
  assertCheck(
    `Enum UserRole (Section ${sectionNum}): VIEWER is strictly absent`,
    parsedEnums['UserRole'] && !parsedEnums['UserRole'].includes('VIEWER'),
    `VIEWER was found in Section ${sectionNum} UserRole inventory`
  );
  assertCheck(
    `Enum UserRole (Section ${sectionNum}): contains exactly 2 roles`,
    parsedEnums['UserRole'] && parsedEnums['UserRole'].length === 2,
    `Expected 2 roles in UserRole, found ${parsedEnums['UserRole'] ? parsedEnums['UserRole'].length : 0}`
  );

  for (const [canonicalName, canonicalLabels] of Object.entries(CANONICAL_ENUMS)) {
    const extractedLabels = parsedEnums[canonicalName];
    assertCheck(
      `Enum ${canonicalName} (Section ${sectionNum}): present in inventory`,
      Boolean(extractedLabels),
      `Enum ${canonicalName} missing in Section ${sectionNum}`
    );
    if (extractedLabels) {
      const match = JSON.stringify(extractedLabels) === JSON.stringify(canonicalLabels);
      assertCheck(
        `Enum ${canonicalName} (Section ${sectionNum}): labels and ordering match canonical`,
        match,
        `Expected ${JSON.stringify(canonicalLabels)} but got ${JSON.stringify(extractedLabels)}`
      );
    }
  }
});

// ==============================================================================
// TEST 3: BOTH ROUTINE INVENTORIES VALIDATION (Section 6 & Section 9)
// ==============================================================================
console.log('\n=== TEST 3: BOTH ROUTINE INVENTORIES VALIDATION (Section 6 & Section 9) ===');

const CANONICAL_ROUTINES = [
  { name: 'resolve_storage_bucket', sec: 'SECURITY INVOKER', owner: 'sbloom_owner', rettype: 'text' },
  { name: 'check_revision_review_linkage', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'record_review_decision', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'jsonb' },
  { name: 'submit_draft_revision', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'jsonb' },
  { name: 'publish_asset_revision', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'jsonb' },
  { name: 'allocate_next_revision', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'jsonb' },
  { name: 'archive_asset', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'jsonb' },
  { name: 'unarchive_asset', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'jsonb' },
  { name: 'delete_draft_revision', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'jsonb' },
  { name: 'process_asset_revision_immutability', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'process_asset_revision_delete', sec: 'SECURITY INVOKER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'process_asset_file_immutability', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'process_protect_asset_revision_counter', sec: 'SECURITY INVOKER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'process_asset_revision_insert_defaults', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'check_asset_published_consistency', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'check_revision_published_consistency', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'process_storage_deletion_job_transition', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'trigger' },
  { name: 'admin_purge_asset', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'jsonb' },
  { name: 'process_audit_events_immutable', sec: 'SECURITY DEFINER', owner: 'sbloom_owner', rettype: 'trigger' }
];

for (const routine of CANONICAL_ROUTINES) {
  const pattern = new RegExp(`\\('${routine.name}',\\s*'${routine.sec}',\\s*'${routine.owner}',\\s*'${routine.rettype}'\\)`, 'g');
  const matches = (sqlContent.match(pattern) || []).length;
  assertCheck(
    `Routine ${routine.name} declared in BOTH Section 6 and Section 9`,
    matches === 2,
    `Found ${matches} occurrences (expected 2)`
  );
}

// ==============================================================================
// TEST 4: VERDICT LOGIC MODEL & NEGATIVE CASES
// ==============================================================================
console.log('\n=== TEST 4: VERDICT LOGIC MODEL & NEGATIVE CASES ===');

// Decision-tree model replicating Section 9 verdict evaluation logic
// Strictly rejects both FALSE and UNKNOWN (null/undefined)
function evaluateVerdictModel(state) {
  // 1. Supabase Auth Dependency (Rejects false AND unknown)
  if (state.auth_schema_exists !== true) return 'PREFLIGHT_FAIL: Schema "auth" does not exist in database catalog.';
  if (state.auth_table_exists !== true) return 'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" was not found in catalog.';
  if (state.has_auth_usage !== true) return 'PREFLIGHT_FAIL: Current user lacks USAGE privilege on schema "auth".';
  if (state.has_users_select !== true) return 'PREFLIGHT_FAIL: Current user lacks SELECT privilege on Supabase Auth dependency "auth.users".';
  if (state.has_valid_id_col !== true) return 'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" column "id" is missing or not of type UUID.';

  // 2. Current User Schema Creation Permissions
  if (state.has_public_create !== true) return 'PREFLIGHT_FAIL: Current user lacks CREATE privilege on schema "public".';
  if (state.has_public_usage !== true) return 'PREFLIGHT_FAIL: Current user lacks USAGE privilege on schema "public".';

  // 3. Role Provisioning & Ownership-Transfer Prerequisites
  if (state.missing_supabase_roles && state.missing_supabase_roles.length > 0) {
    return `PREFLIGHT_FAIL: Required Supabase role(s) not found in catalog: ${state.missing_supabase_roles.join(', ')}. Role "service_role" must exist prior to schema setup.`;
  }
  if (state.missing_roles && state.missing_roles.length > 0 && state.can_manage_roles !== true) {
    return `PREFLIGHT_FAIL: Current user lacks CREATEROLE/SUPERUSER privilege to provision missing role(s): ${state.missing_roles.join(', ')}.`;
  }
  if (state.owner_exists === true && state.user_can_set_owner !== true) {
    return 'PREFLIGHT_FAIL: Role "sbloom_owner" already exists but current user lacks SET capability and cannot assign table/routine ownership.';
  }
  if (state.owner_exists === true && state.owner_has_public_create !== true) {
    return 'PREFLIGHT_FAIL: Role "sbloom_owner" already exists but lacks CREATE privilege on schema "public" (required for ownership transfer).';
  }
  if (state.app_exists === true && state.user_can_grant_app !== true) {
    return 'PREFLIGHT_FAIL: Role "sbloom_app" already exists but current user lacks ADMIN OPTION to grant it to "service_role".';
  }

  // 4. Security Boundary Violations
  if (state.unsafe_role_access && state.unsafe_role_access.length > 0) {
    return `PREFLIGHT_FAIL: Security violation detected: ${state.unsafe_role_access.join('; ')}.`;
  }

  // 5. Non-Table Conflicts
  if (state.non_table_conflicts && state.non_table_conflicts.length > 0) {
    return `PREFLIGHT_FAIL: Conflicting non-table objects (views/sequences) detected with target names: ${state.non_table_conflicts.join(', ')}.`;
  }

  // 6. Enum Conflicts
  if (state.incompatible_enums && state.incompatible_enums.length > 0) {
    return `PREFLIGHT_FAIL: Conflicting enum types detected: ${state.incompatible_enums.join(', ')}.`;
  }

  // 7. Domain Table Partial Conflict
  if (state.existing_tables_count > 0 && state.existing_tables_count < 11) {
    return `PREFLIGHT_FAIL: Partial domain tables detected (${state.existing_tables_count} of 11: ${state.existing_tables.join(', ')}). STOP: inspect existing objects and dependencies, and preserve data. Do not automatically drop or recreate tables.`;
  }

  // 8. Routine Conflicts
  if (state.routine_conflicts && state.routine_conflicts.length > 0) {
    return `PREFLIGHT_FAIL: Conflicting routine(s) detected: ${state.routine_conflicts.join(', ')}. Signature, security mode, search path, or execution grants mismatch canonical definitions.`;
  }

  // 9. Notices
  if (state.existing_tables_count === 11) {
    return 'PREFLIGHT_NOTICE: All 11 domain tables already exist. Do not run 02_create_schema.sql. Run 03_verify_schema.sql to inspect status.';
  }
  if (state.legacy_tables_count > 0) {
    return `PREFLIGHT_NOTICE: Legacy unprefixed tables detected in public (${state.legacy_tables_count} detected: ${state.legacy_tables.join(', ')}). STOP: inspect existing objects and dependencies, and preserve data. Do not automatically drop or recreate tables.`;
  }
  if (state.existing_routines_count > 0) {
    return `PREFLIGHT_NOTICE: Pre-existing routine(s) detected with target names (${state.existing_routines_count} of 19: ${state.existing_routines.join(', ')}). Manual review required: verify routine definitions against 02_create_schema.sql before proceeding.`;
  }

  // 10. Pass
  return 'PREFLIGHT_PASS: Environment is clean and all prerequisites are verified. Safe to proceed with 02_create_schema.sql.';
}

const cleanBaseline = {
  auth_schema_exists: true,
  auth_table_exists: true,
  has_auth_usage: true,
  has_users_select: true,
  has_valid_id_col: true,
  has_public_create: true,
  has_public_usage: true,
  can_manage_roles: true,
  missing_supabase_roles: [],
  missing_roles: [],
  owner_exists: true,
  user_can_set_owner: true,
  owner_has_public_create: true,
  app_exists: true,
  user_can_grant_app: true,
  unsafe_role_access: [],
  non_table_conflicts: [],
  incompatible_enums: [],
  existing_tables_count: 0,
  existing_tables: [],
  routine_conflicts: [],
  legacy_tables_count: 0,
  legacy_tables: [],
  existing_routines_count: 0,
  existing_routines: []
};

const modelTestCases = [
  {
    name: 'Clean baseline environment',
    state: { ...cleanBaseline },
    expected: 'PREFLIGHT_PASS: Environment is clean and all prerequisites are verified. Safe to proceed with 02_create_schema.sql.'
  },
  {
    name: 'Fail: Schema auth does not exist',
    state: { ...cleanBaseline, auth_schema_exists: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Schema "auth" does not exist in database catalog'
  },
  {
    name: 'Fail: auth.users table missing',
    state: { ...cleanBaseline, auth_table_exists: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" was not found in catalog'
  },
  {
    name: 'Fail: Missing USAGE on schema auth',
    state: { ...cleanBaseline, has_auth_usage: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Current user lacks USAGE privilege on schema "auth"'
  },
  {
    name: 'Fail: Missing SELECT on auth.users',
    state: { ...cleanBaseline, has_users_select: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Current user lacks SELECT privilege on Supabase Auth dependency "auth.users"'
  },
  {
    name: 'Fail: auth.users.id is not UUID',
    state: { ...cleanBaseline, has_valid_id_col: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" column "id" is missing or not of type UUID'
  },
  {
    name: 'Fail: auth.users.id is NULL/unknown (column missing)',
    state: { ...cleanBaseline, has_valid_id_col: null },
    expectedPrefix: 'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" column "id" is missing or not of type UUID'
  },
  {
    name: 'Fail: Current user lacks CREATE on public',
    state: { ...cleanBaseline, has_public_create: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Current user lacks CREATE privilege on schema "public"'
  },
  {
    name: 'Fail: Missing required Supabase role service_role',
    state: { ...cleanBaseline, missing_supabase_roles: ['service_role'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Required Supabase role(s) not found in catalog: service_role'
  },
  {
    name: 'Fail: Missing roles when user lacks CREATEROLE',
    state: { ...cleanBaseline, can_manage_roles: false, missing_roles: ['sbloom_owner', 'sbloom_admin', 'sbloom_app'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Current user lacks CREATEROLE/SUPERUSER privilege to provision missing role(s): sbloom_owner, sbloom_admin, sbloom_app'
  },
  {
    name: 'Fail: sbloom_owner exists but user lacks SET capability',
    state: { ...cleanBaseline, owner_exists: true, user_can_set_owner: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Role "sbloom_owner" already exists but current user lacks SET capability'
  },
  {
    name: 'Fail: sbloom_owner exists but lacks CREATE on public',
    state: { ...cleanBaseline, owner_exists: true, user_can_set_owner: true, owner_has_public_create: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Role "sbloom_owner" already exists but lacks CREATE privilege on schema "public"'
  },
  {
    name: 'Fail: sbloom_app exists but user lacks ADMIN OPTION',
    state: { ...cleanBaseline, app_exists: true, user_can_grant_app: false },
    expectedPrefix: 'PREFLIGHT_FAIL: Role "sbloom_app" already exists but current user lacks ADMIN OPTION'
  },
  {
    name: 'Fail: sbloom_app has administrative access (sbloom_admin)',
    state: { ...cleanBaseline, unsafe_role_access: ['sbloom_app -> sbloom_admin'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Security violation detected: sbloom_app -> sbloom_admin'
  },
  {
    name: 'Fail: service_role has sbloom_admin access',
    state: { ...cleanBaseline, unsafe_role_access: ['service_role -> sbloom_admin'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Security violation detected: service_role -> sbloom_admin'
  },
  {
    name: 'Fail: anon has sbloom_app access',
    state: { ...cleanBaseline, unsafe_role_access: ['anon -> sbloom_app'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Security violation detected: anon -> sbloom_app'
  },
  {
    name: 'Fail: Non-login role has LOGIN enabled',
    state: { ...cleanBaseline, unsafe_role_access: ['sbloom_owner (LOGIN enabled)'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Security violation detected: sbloom_owner (LOGIN enabled)'
  },
  {
    name: 'Fail: sBLOOM role has elevated privileges (sbloom_app)',
    state: { ...cleanBaseline, unsafe_role_access: ['sbloom_app (Elevated privileges: superuser/createrole/bypassrls)'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Security violation detected: sbloom_app (Elevated privileges: superuser/createrole/bypassrls)'
  },
  {
    name: 'Fail: Conflicting view with target name',
    state: { ...cleanBaseline, non_table_conflicts: ['assets_templatedhub'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Conflicting non-table objects (views/sequences) detected with target names: assets_templatedhub'
  },
  {
    name: 'Fail: Enum non-enum type collision',
    state: { ...cleanBaseline, incompatible_enums: ['FileRole (NON_ENUM_TYPE)'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Conflicting enum types detected: FileRole (NON_ENUM_TYPE)'
  },
  {
    name: 'Fail: Partial domain tables (3 of 11)',
    state: { ...cleanBaseline, existing_tables_count: 3, existing_tables: ['users_templatedhub', 'assets_templatedhub', 'reviews_templatedhub'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Partial domain tables detected (3 of 11: users_templatedhub, assets_templatedhub, reviews_templatedhub). STOP: inspect existing objects and dependencies, and preserve data'
  },
  {
    name: 'Fail: Routine security mode mismatch',
    state: { ...cleanBaseline, routine_conflicts: ['admin_purge_asset (SECURITY_MODE_MISMATCH)'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Conflicting routine(s) detected: admin_purge_asset (SECURITY_MODE_MISMATCH)'
  },
  {
    name: 'Fail beats Notice: Failures evaluated before legacy notice',
    state: { ...cleanBaseline, has_public_create: false, legacy_tables_count: 5, legacy_tables: ['users', 'assets', 'reviews', 'asset_types', 'asset_files'] },
    expectedPrefix: 'PREFLIGHT_FAIL: Current user lacks CREATE privilege on schema "public"'
  },
  {
    name: 'Notice: Unresolved legacy tables evaluated when zero failures exist',
    state: { ...cleanBaseline, legacy_tables_count: 3, legacy_tables: ['users', 'assets', 'reviews'] },
    expectedPrefix: 'PREFLIGHT_NOTICE: Legacy unprefixed tables detected in public (3 detected: users, assets, reviews). STOP: inspect existing objects and dependencies, and preserve data'
  },
  {
    name: 'Notice: Pre-existing routines require manual review',
    state: { ...cleanBaseline, existing_routines_count: 2, existing_routines: ['resolve_storage_bucket', 'admin_purge_asset'] },
    expectedPrefix: 'PREFLIGHT_NOTICE: Pre-existing routine(s) detected with target names (2 of 19: resolve_storage_bucket, admin_purge_asset). Manual review required'
  }
];

for (const tc of modelTestCases) {
  const result = evaluateVerdictModel(tc.state);
  const pass = tc.expected ? result === tc.expected : result.startsWith(tc.expectedPrefix);
  assertCheck(
    `Verdict test: ${tc.name}`,
    pass,
    `Expected: ${tc.expected || tc.expectedPrefix} | Got: ${result}`
  );
}

console.log(`\n=== MODEL TEST SUMMARY: ${failureCount === 0 ? 'ALL PASSED' : failureCount + ' FAILURES'} ===`);
if (failureCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
