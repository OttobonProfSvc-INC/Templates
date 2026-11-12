// ==============================================================================
// sBLOOM Schema Security & ACL Invariants Test Suite
// File: packages/database/test/schema-security-acls.test.js
// Purpose: Validates final object-level security & least-privilege ACL invariants
//          against an isolated disposable local PostgreSQL instance:
//            1. Zero schema-wide ALL TABLES/FUNCTIONS IN SCHEMA or ALTER DEFAULT PRIVILEGES
//            2. Execution of 02_create_schema.sql in a fresh catalog
//            3. Object-level direct table privilege revocation on all 11 tables for service_role
//            4. Object-level direct routine privilege revocation on all 19 routines for PUBLIC, anon, authenticated, service_role
//            5. Selective routine execution grants (8 routines to sbloom_app, 4 to sbloom_admin)
//            6. Inherited access only for service_role via sbloom_app membership
//            7. Administrative purge (admin_purge_asset) isolated from sbloom_app and service_role
//            8. All 10 trigger procedures isolated from client and service roles
//            9. Execution of 03_verify_schema.sql with 100% PASS on all 12 scorecard items
// ==============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { execSync } = require('child_process');
const { Client } = require('pg');

const SCHEMA_02_PATH = path.resolve(__dirname, '../supabase/02_create_schema.sql');
const VERIFY_03_PATH = path.resolve(__dirname, '../supabase/03_verify_schema.sql');
const PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const INITDB_BIN = path.join(PG_BIN_DIR, 'initdb.exe');
const PG_CTL_BIN = path.join(PG_BIN_DIR, 'pg_ctl.exe');

let failureCount = 0;

function assertTest(name, passed, detail = '') {
  if (passed) {
    console.log(`  [PASS] ${name}`);
  } else {
    console.error(`  [FAIL] ${name} ${detail ? '-> ' + detail : ''}`);
    failureCount++;
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const EXPECTED_TABLES = [
  'users_templatedhub', 'asset_types_templatedhub', 'assets_templatedhub',
  'asset_revisions_templatedhub', 'asset_files_templatedhub', 'reviews_templatedhub',
  'audit_events_templatedhub', 'collections_templatedhub', 'collection_assets_templatedhub',
  'asset_usages_templatedhub', 'storage_deletion_jobs_templatedhub'
];

const EXPECTED_ROUTINES = [
  'resolve_storage_bucket', 'check_revision_review_linkage', 'record_review_decision',
  'submit_draft_revision', 'publish_asset_revision', 'allocate_next_revision',
  'archive_asset', 'unarchive_asset', 'delete_draft_revision',
  'process_asset_revision_immutability', 'process_asset_revision_delete',
  'process_asset_file_immutability', 'process_protect_asset_revision_counter',
  'process_asset_revision_insert_defaults', 'check_asset_published_consistency',
  'check_revision_published_consistency', 'process_storage_deletion_job_transition',
  'admin_purge_asset', 'process_audit_events_immutable'
];

const INTENDED_SBLOOM_APP_ROUTINES = [
  'submit_draft_revision', 'record_review_decision', 'publish_asset_revision',
  'allocate_next_revision', 'delete_draft_revision', 'archive_asset',
  'unarchive_asset', 'resolve_storage_bucket'
];

const INTENDED_SBLOOM_ADMIN_ROUTINES = [
  'admin_purge_asset', 'resolve_storage_bucket', 'archive_asset', 'unarchive_asset'
];

const TRIGGER_ROUTINES = [
  'check_revision_review_linkage', 'process_asset_revision_immutability',
  'process_asset_revision_delete', 'process_asset_file_immutability',
  'process_protect_asset_revision_counter', 'process_asset_revision_insert_defaults',
  'check_asset_published_consistency', 'check_revision_published_consistency',
  'process_storage_deletion_job_transition', 'process_audit_events_immutable'
];

async function main() {
  console.log('=== sBLOOM SCHEMA SECURITY & ACL INVARIANTS TEST SUITE ===\n');

  // ---------------------------------------------------------------------------
  // TEST 1: STATIC CODE AUDIT (No schema-wide grants/revokes or default privileges)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Static Multi-Tenant Safety & Anti-Pattern Check ---');
  const sql02Content = fs.readFileSync(SCHEMA_02_PATH, 'utf8');
  const sql03Content = fs.readFileSync(VERIFY_03_PATH, 'utf8');

  // Strip single-line and multi-line comments for pure SQL statement evaluation
  const sql02WithoutComments = sql02Content
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  assertTest(
    '02_create_schema.sql contains zero schema-wide ALL TABLES IN SCHEMA grants/revokes',
    !/ALL\s+TABLES\s+IN\s+SCHEMA/i.test(sql02WithoutComments)
  );

  assertTest(
    '02_create_schema.sql contains zero schema-wide ALL FUNCTIONS IN SCHEMA grants/revokes',
    !/ALL\s+FUNCTIONS\s+IN\s+SCHEMA/i.test(sql02WithoutComments)
  );

  assertTest(
    '02_create_schema.sql contains zero ALTER DEFAULT PRIVILEGES commands',
    !/ALTER\s+DEFAULT\s+PRIVILEGES/i.test(sql02WithoutComments)
  );

  assertTest(
    '02_create_schema.sql explicitly specifies service_role in table revocation DO block',
    /rolname\s*=\s*'service_role'[\s\S]*?REVOKE\s+ALL\s+ON\s+TABLE[\s\S]*?FROM\s+service_role/i.test(sql02Content)
  );

  assertTest(
    '02_create_schema.sql explicitly revokes EXECUTE on routines from PUBLIC, anon, authenticated, service_role',
    /REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]*?FROM\s+PUBLIC/i.test(sql02Content) &&
    /rolname\s*=\s*'service_role'[\s\S]*?REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]*?FROM\s+service_role/i.test(sql02Content)
  );

  // ---------------------------------------------------------------------------
  // TEST 2: DATABASE EXECUTION & ACL VERIFICATION
  // ---------------------------------------------------------------------------
  if (!fs.existsSync(INITDB_BIN) || !fs.existsSync(PG_CTL_BIN)) {
    console.error('[BLOCKER] PostgreSQL binaries not found. Skipping live cluster verification.');
    process.exit(1);
  }

  const runId = `pg_acl_cluster_${process.pid}_${Date.now()}`;
  const tempClusterDir = path.join(os.tmpdir(), runId);
  const testPort = await getFreePort();

  console.log(`\nInitializing disposable PostgreSQL cluster: ${tempClusterDir}`);
  execSync(`"${INITDB_BIN}" -A trust -U postgres -E UTF8 --no-locale -D "${tempClusterDir}"`, {
    stdio: 'ignore', timeout: 20000
  });

  const logFile = path.join(tempClusterDir, 'pg_server.log');
  execSync(`"${PG_CTL_BIN}" -D "${tempClusterDir}" -l "${logFile}" -w -o "-p ${testPort} -F" start`, {
    stdio: 'ignore', timeout: 20000
  });

  let client;
  try {
    await new Promise(r => setTimeout(r, 1500));
    client = new Client({
      host: '127.0.0.1',
      port: testPort,
      user: 'postgres',
      database: 'postgres'
    });
    await client.connect();

    // 1. Setup prerequisite Supabase environment
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
    `);

    // 2. Execute 02_create_schema.sql
    console.log('\n--- TEST 2: 02_create_schema.sql Execution ---');
    await client.query(sql02Content);
    assertTest('02_create_schema.sql executed without errors', true);

    // 3. Verify Direct Table Grants
    console.log('\n--- TEST 3: Direct Table Privilege Isolation ---');
    const directTableGrants = await client.query(`
      SELECT grantee, table_name, privilege_type 
      FROM information_schema.table_privileges 
      WHERE table_schema = 'public' 
        AND table_name = ANY($1)
        AND grantee IN ('service_role', 'anon', 'authenticated', 'PUBLIC');
    `, [EXPECTED_TABLES]);

    assertTest(
      'service_role has 0 direct table grants across all 11 sBLOOM tables',
      directTableGrants.rows.filter(r => r.grantee === 'service_role').length === 0,
      `Found grants: ${JSON.stringify(directTableGrants.rows.filter(r => r.grantee === 'service_role'))}`
    );

    assertTest(
      'anon, authenticated, and PUBLIC have 0 direct table grants across all 11 sBLOOM tables',
      directTableGrants.rows.filter(r => ['anon', 'authenticated', 'PUBLIC'].includes(r.grantee)).length === 0,
      `Found grants: ${JSON.stringify(directTableGrants.rows)}`
    );

    // 4. Verify Direct Routine Execution Grants
    console.log('\n--- TEST 4: Direct Routine Privilege Isolation ---');
    const directRoutineGrants = await client.query(`
      SELECT grantee, specific_schema, routine_name, privilege_type
      FROM information_schema.routine_privileges
      WHERE specific_schema = 'public'
        AND routine_name = ANY($1)
        AND grantee IN ('service_role', 'anon', 'authenticated', 'PUBLIC');
    `, [EXPECTED_ROUTINES]);

    assertTest(
      'service_role has 0 direct EXECUTE grants on all 19 sBLOOM routines',
      directRoutineGrants.rows.filter(r => r.grantee === 'service_role').length === 0,
      `Found direct grants: ${JSON.stringify(directRoutineGrants.rows.filter(r => r.grantee === 'service_role'))}`
    );

    assertTest(
      'anon, authenticated, and PUBLIC have 0 direct EXECUTE grants on all 19 sBLOOM routines',
      directRoutineGrants.rows.filter(r => ['anon', 'authenticated', 'PUBLIC'].includes(r.grantee)).length === 0,
      `Found direct grants: ${JSON.stringify(directRoutineGrants.rows)}`
    );

    // 5. Verify Effective Routine Execution Permissions
    console.log('\n--- TEST 5: Effective Routine Execution Matrix ---');
    const effectivePerms = await client.query(`
      SELECT 
        p.proname,
        r.rolname,
        has_function_privilege(r.rolname, p.oid, 'EXECUTE') as has_exec
      FROM pg_proc p
      CROSS JOIN (
        SELECT 'service_role' as rolname UNION ALL
        SELECT 'anon' UNION ALL
        SELECT 'authenticated' UNION ALL
        SELECT 'public' UNION ALL
        SELECT 'sbloom_app' UNION ALL
        SELECT 'sbloom_admin'
      ) r
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname = ANY($1)
      ORDER BY p.proname, r.rolname;
    `, [EXPECTED_ROUTINES]);

    const perms = {};
    for (const row of effectivePerms.rows) {
      if (!perms[row.proname]) perms[row.proname] = {};
      perms[row.proname][row.rolname] = row.has_exec;
    }

    // 5a. anon & authenticated & public must have false for ALL 19 routines
    let clientLeaks = 0;
    for (const routine of EXPECTED_ROUTINES) {
      if (perms[routine]?.anon || perms[routine]?.authenticated || perms[routine]?.public) {
        clientLeaks++;
      }
    }
    assertTest(
      'All 19 routines have EXECUTE = false for anon, authenticated, and public',
      clientLeaks === 0,
      `Leaks found in ${clientLeaks} routines`
    );

    // 5b. sbloom_admin must have true for exactly the 4 intended routines
    let adminMismatch = false;
    for (const routine of EXPECTED_ROUTINES) {
      const expected = INTENDED_SBLOOM_ADMIN_ROUTINES.includes(routine);
      const actual = perms[routine]?.sbloom_admin;
      if (expected !== actual) {
        adminMismatch = true;
        console.error(`    Mismatch on sbloom_admin for ${routine}: expected ${expected}, got ${actual}`);
      }
    }
    assertTest('sbloom_admin has EXECUTE = true ONLY on the 4 intended admin routines', !adminMismatch);

    // 5c. sbloom_app must have true for exactly the 8 intended routines
    let appMismatch = false;
    for (const routine of EXPECTED_ROUTINES) {
      const expected = INTENDED_SBLOOM_APP_ROUTINES.includes(routine);
      const actual = perms[routine]?.sbloom_app;
      if (expected !== actual) {
        appMismatch = true;
        console.error(`    Mismatch on sbloom_app for ${routine}: expected ${expected}, got ${actual}`);
      }
    }
    assertTest('sbloom_app has EXECUTE = true ONLY on the 8 intended client routines', !appMismatch);

    // 5d. service_role inherits sbloom_app routines, but NOT admin_purge_asset or trigger functions
    let serviceMismatch = false;
    for (const routine of EXPECTED_ROUTINES) {
      const expected = INTENDED_SBLOOM_APP_ROUTINES.includes(routine);
      const actual = perms[routine]?.service_role;
      if (expected !== actual) {
        serviceMismatch = true;
        console.error(`    Mismatch on service_role for ${routine}: expected ${expected}, got ${actual}`);
      }
    }
    assertTest(
      'service_role inherits execution on exactly the 8 sbloom_app routines (inherited via sbloom_app)',
      !serviceMismatch
    );

    assertTest(
      'admin_purge_asset is strictly non-executable by service_role and sbloom_app',
      perms['admin_purge_asset']?.service_role === false && perms['admin_purge_asset']?.sbloom_app === false
    );

    // 5e. Trigger procedures must be non-executable by any client/service role
    let triggerLeaks = 0;
    for (const routine of TRIGGER_ROUTINES) {
      if (perms[routine]?.sbloom_app || perms[routine]?.service_role || perms[routine]?.sbloom_admin) {
        triggerLeaks++;
      }
    }
    assertTest(
      'All 10 trigger functions are non-executable by sbloom_app, sbloom_admin, and service_role',
      triggerLeaks === 0
    );

    // 6. Execute 03_verify_schema.sql and assert all 12 Scorecard items return PASS
    console.log('\n--- TEST 6: 03_verify_schema.sql Scorecard Validation ---');
    const verifyRes = await client.query(sql03Content);
    const scorecardRes = Array.isArray(verifyRes) ? verifyRes[verifyRes.length - 1] : verifyRes;
    
    assertTest(
      '03_verify_schema.sql executes cleanly and returns 12 scorecard items',
      scorecardRes.rows.length === 12,
      `Received ${scorecardRes.rows.length} rows`
    );

    for (const item of scorecardRes.rows) {
      assertTest(
        `Scorecard [${item.verification_check}]: ${item.result}`,
        item.status === 'PASS',
        `Status: ${item.status}`
      );
    }

  } finally {
    if (client) await client.end();
    console.log('\nStopping disposable PostgreSQL cluster...');
    execSync(`"${PG_CTL_BIN}" -D "${tempClusterDir}" -w stop`, { stdio: 'ignore' });
    fs.rmSync(tempClusterDir, { recursive: true, force: true });
  }

  console.log(`\n=== TEST SUMMARY: ${failureCount === 0 ? 'ALL PASSED' : failureCount + ' FAILURES'} ===`);
  if (failureCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL EXCEPTION]', err);
  process.exit(1);
});
