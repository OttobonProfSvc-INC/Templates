// ==============================================================================
// sBLOOM Preflight SQL Execution Test Suite against Disposable PostgreSQL Fixtures
// File: packages/database/test/preflight-sql-execution.test.js
// Purpose: Spawns an isolated disposable local PostgreSQL 18 instance to execute
//          the ENTIRE 01_preflight.sql script against concrete catalog fixtures:
//            1. Missing schema auth
//            2. Missing table auth.users
//            3. Table auth.users present with columns, but NO id column
//            4. Table auth.users id column is not UUID
//            5. Non-superuser provisioning identity lacking CREATEROLE
//            6. Non-superuser membership with SET FALSE
//            7. Missing required Supabase role: service_role
//            8. Security violations: unauthorized access & sBLOOM role attributes
//            9. Incompatible enum definition & non-enum type collision
//            10. Domain object collisions (views) & partial domain tables
//            11. Pre-existing routines manual review notice
//            12. Clean baseline Supabase environment producing PREFLIGHT_PASS
// ==============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { execSync } = require('child_process');
const { Client } = require('pg');

const PREFLIGHT_SQL_PATH = path.resolve(__dirname, '../supabase/01_preflight.sql');
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

// Executes the entire 01_preflight.sql file and extracts the Section 9 verdict
async function executeWholePreflight(client, preflightSql) {
  const result = await client.query(preflightSql);
  // node-postgres returns array of results for multi-statement queries
  if (Array.isArray(result)) {
    const lastResult = result[result.length - 1];
    return lastResult.rows[0];
  }
  return result.rows[0];
}

async function main() {
  console.log('=== PREFLIGHT SQL EXECUTION TEST SUITE (DISPOSABLE POSTGRESQL FIXTURES) ===\n');

  // Verify binaries exist - required skips must block readiness
  if (!fs.existsSync(INITDB_BIN) || !fs.existsSync(PG_CTL_BIN)) {
    console.error('[BLOCKER] Required PostgreSQL binaries initdb.exe or pg_ctl.exe not found on system.');
    console.error('SQL execution tests CANNOT be skipped for readiness verification.');
    process.exit(1);
  }

  // Load raw 01_preflight.sql
  if (!fs.existsSync(PREFLIGHT_SQL_PATH)) {
    console.error(`[FATAL] 01_preflight.sql not found at ${PREFLIGHT_SQL_PATH}`);
    process.exit(1);
  }
  const preflightSql = fs.readFileSync(PREFLIGHT_SQL_PATH, 'utf8');

  // Unique run-owned temporary cluster directory and dynamic port
  const runId = `pg_cluster_${process.pid}_${Date.now()}`;
  const tempClusterDir = path.join(os.tmpdir(), runId);
  const testPort = await getFreePort();

  console.log(`Initializing disposable PostgreSQL cluster in unique directory: ${tempClusterDir}`);
  try {
    execSync(`"${INITDB_BIN}" -A trust -U postgres -E UTF8 --no-locale -D "${tempClusterDir}"`, {
      stdio: 'ignore',
      timeout: 20000
    });
  } catch (err) {
    console.error('[FATAL] Failed to initialize disposable PostgreSQL cluster:', err.message);
    process.exit(1);
  }

  console.log(`Starting disposable PostgreSQL instance on dynamic port ${testPort}...`);
  const logFile = path.join(tempClusterDir, 'pg_server.log');
  try {
    execSync(`"${PG_CTL_BIN}" -D "${tempClusterDir}" -l "${logFile}" -w -o "-p ${testPort} -F" start`, {
      stdio: 'ignore',
      timeout: 20000
    });
  } catch (err) {
    console.error('[FATAL] Failed to start disposable PostgreSQL instance:', err.message);
    process.exit(1);
  }

  let pgClient;
  try {
    await new Promise(r => setTimeout(r, 1500));
    pgClient = new Client({
      host: '127.0.0.1',
      port: testPort,
      user: 'postgres',
      database: 'postgres'
    });
    await pgClient.connect();
    console.log(`Connected to disposable PostgreSQL server on port ${testPort}.\n`);

    // -------------------------------------------------------------------------
    // FIXTURE 1: Missing Schema 'auth'
    // -------------------------------------------------------------------------
    console.log('--- FIXTURE 1: Missing Dependency (Schema "auth") ---');
    {
      const res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Missing auth schema triggers explicit diagnostic failure across full script',
        res.verdict === 'PREFLIGHT_FAIL: Schema "auth" does not exist in database catalog.',
        res.verdict
      );
    }

    // -------------------------------------------------------------------------
    // FIXTURE 2: Schema 'auth' exists but table 'auth.users' is missing
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 2: Missing Dependency (Table "auth.users") ---');
    {
      await pgClient.query('CREATE SCHEMA auth;');
      const res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Missing auth.users table triggers explicit diagnostic failure across full script',
        res.verdict === 'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" was not found in catalog.',
        res.verdict
      );
    }

    // -------------------------------------------------------------------------
    // FIXTURE 3: Table 'auth.users' exists with columns, but NO 'id' column
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 3: Missing auth.users.id Column (NULL Path) ---');
    {
      await pgClient.query('CREATE TABLE auth.users (email TEXT, created_at TIMESTAMPTZ);');
      const res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Missing auth.users.id column triggers explicit failure (rejects NULL/unknown)',
        res.verdict === 'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" column "id" is missing or not of type UUID.',
        res.verdict
      );
      await pgClient.query('DROP TABLE auth.users;');
    }

    // -------------------------------------------------------------------------
    // FIXTURE 4: Table 'auth.users' exists but column 'id' is integer, not UUID
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 4: Non-UUID auth.users.id Column ---');
    {
      await pgClient.query('CREATE TABLE auth.users (id INT PRIMARY KEY, email TEXT);');
      const res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Non-UUID auth.users.id triggers explicit UUID type requirement failure',
        res.verdict === 'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" column "id" is missing or not of type UUID.',
        res.verdict
      );
      await pgClient.query('DROP TABLE auth.users;');
      await pgClient.query('CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);');
    }

    // -------------------------------------------------------------------------
    // FIXTURE 5: Non-Superuser Provisioning Identity lacking CREATEROLE
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 5: Non-Superuser Provisioning Identity ---');
    {
      await pgClient.query('CREATE ROLE restricted_dev LOGIN NOCREATEROLE NOSUPERUSER;');
      await pgClient.query('GRANT CREATE, USAGE ON SCHEMA public TO restricted_dev;');
      await pgClient.query('GRANT USAGE ON SCHEMA auth TO restricted_dev;');
      await pgClient.query('GRANT SELECT ON auth.users TO restricted_dev;');

      const devClient = new Client({
        host: '127.0.0.1',
        port: testPort,
        user: 'restricted_dev',
        database: 'postgres'
      });
      await devClient.connect();

      const res = await executeWholePreflight(devClient, preflightSql);
      assertTest(
        'restricted_dev lacking CREATEROLE triggers role provisioning prerequisite failure',
        res.verdict.startsWith('PREFLIGHT_FAIL: Required Supabase role(s) not found in catalog: service_role') ||
        res.verdict.startsWith('PREFLIGHT_FAIL: Current user lacks CREATEROLE/SUPERUSER privilege to provision missing role(s)'),
        res.verdict
      );

      await devClient.end();
      await pgClient.query(`
        REVOKE ALL ON SCHEMA public FROM restricted_dev;
        REVOKE ALL ON SCHEMA auth FROM restricted_dev;
        REVOKE ALL ON auth.users FROM restricted_dev;
        DROP ROLE restricted_dev;
      `);
    }

    // -------------------------------------------------------------------------
    // FIXTURE 6: Non-Superuser Membership with SET FALSE
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 6: Non-Superuser Membership with SET FALSE ---');
    {
      await pgClient.query(`
        CREATE ROLE service_role NOLOGIN;
        CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE anon NOLOGIN;
        CREATE ROLE sbloom_owner NOLOGIN;
        CREATE ROLE sbloom_admin NOLOGIN;
        CREATE ROLE sbloom_app NOLOGIN;
        GRANT CREATE ON SCHEMA public TO sbloom_owner;
      `);

      await pgClient.query('CREATE ROLE dev_set_false LOGIN NOCREATEROLE NOSUPERUSER;');
      await pgClient.query('GRANT CREATE, USAGE ON SCHEMA public TO dev_set_false;');
      await pgClient.query('GRANT USAGE ON SCHEMA auth TO dev_set_false;');
      await pgClient.query('GRANT SELECT ON auth.users TO dev_set_false;');
      await pgClient.query('GRANT sbloom_owner TO dev_set_false WITH SET FALSE;');

      const setFalseClient = new Client({
        host: '127.0.0.1',
        port: testPort,
        user: 'dev_set_false',
        database: 'postgres'
      });
      await setFalseClient.connect();

      const res = await executeWholePreflight(setFalseClient, preflightSql);
      assertTest(
        'dev_set_false with SET FALSE membership fails SET-capability requirement',
        res.verdict === 'PREFLIGHT_FAIL: Role "sbloom_owner" already exists but current user lacks SET capability and cannot assign table/routine ownership.',
        res.verdict
      );

      await setFalseClient.end();
      await pgClient.query(`
        REVOKE ALL ON SCHEMA public FROM dev_set_false;
        REVOKE ALL ON SCHEMA auth FROM dev_set_false;
        REVOKE ALL ON auth.users FROM dev_set_false;
        DROP ROLE dev_set_false;
      `);
    }

    // -------------------------------------------------------------------------
    // FIXTURE 7: Missing Required Supabase Role (service_role)
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 7: Missing Required Supabase Role (service_role) ---');
    {
      await pgClient.query('DROP ROLE service_role;');
      let res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Missing service_role triggers explicit required Supabase role failure',
        res.verdict.includes('Required Supabase role(s) not found in catalog: service_role'),
        res.verdict
      );
      await pgClient.query('CREATE ROLE service_role NOLOGIN;');
    }

    // -------------------------------------------------------------------------
    // FIXTURE 8: Security Violations (Role Access & LOGIN Privileges)
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 8: Security Violations (Role Access & LOGIN Privileges) ---');
    {
      // Sub-case 8A: service_role has membership in sbloom_admin
      await pgClient.query('GRANT sbloom_admin TO service_role;');
      let res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'service_role having membership in sbloom_admin fails security boundary check',
        res.verdict.includes('service_role -> sbloom_admin'),
        res.verdict
      );
      await pgClient.query('REVOKE sbloom_admin FROM service_role;');

      // Sub-case 8B: sbloom_app has administrative access (sbloom_admin)
      await pgClient.query('GRANT sbloom_admin TO sbloom_app;');
      res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'sbloom_app having administrative access fails isolation check before service_role grant',
        res.verdict.includes('sbloom_app -> sbloom_admin'),
        res.verdict
      );
      await pgClient.query('REVOKE sbloom_admin FROM sbloom_app;');

      // Sub-case 8C: sbloom_owner has LOGIN privilege enabled
      await pgClient.query('ALTER ROLE sbloom_owner LOGIN;');
      res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'sbloom_owner with LOGIN enabled triggers security violation',
        res.verdict.includes('sbloom_owner (LOGIN enabled)'),
        res.verdict
      );
      await pgClient.query('ALTER ROLE sbloom_owner NOLOGIN;');

      // Sub-case 8D: sbloom_admin has elevated attribute (SUPERUSER)
      await pgClient.query('ALTER ROLE sbloom_admin SUPERUSER;');
      res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'sbloom_admin with SUPERUSER enabled triggers elevated privilege security violation',
        res.verdict.includes('sbloom_admin (Elevated privileges: superuser/createrole/bypassrls)'),
        res.verdict
      );
      await pgClient.query('ALTER ROLE sbloom_admin NOSUPERUSER;');
    }

    // -------------------------------------------------------------------------
    // FIXTURE 9: Incompatible Enum & Non-Enum Type Collisions
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 9: Incompatible Enum & Non-Enum Type Collisions ---');
    {
      // Create FileRole with missing 'ATTACHMENT'
      await pgClient.query(`CREATE TYPE "FileRole" AS ENUM ('PRIMARY_ENTRY', 'SOURCE_ARCHIVE', 'THUMBNAIL', 'PREVIEW_IMAGE');`);
      let res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Enum missing canonical labels fails definition-level check',
        res.verdict.includes('FileRole (LABEL_OR_ORDER_MISMATCH)'),
        res.verdict
      );
      await pgClient.query('DROP TYPE "FileRole";');

      // Create non-enum table occupying FileRole name
      await pgClient.query('CREATE TABLE "FileRole" (id int);');
      res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Non-enum table occupying expected enum name fails as NON_ENUM_TYPE',
        res.verdict.includes('FileRole (NON_ENUM_TYPE)'),
        res.verdict
      );
      await pgClient.query('DROP TABLE "FileRole";');

      // Sub-case 9B: UserRole with legacy VIEWER label fails definition check
      await pgClient.query(`CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CONTRIBUTOR', 'VIEWER');`);
      res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'UserRole containing legacy VIEWER label fails definition check',
        res.verdict.includes('UserRole (LABEL_OR_ORDER_MISMATCH)'),
        res.verdict
      );
      await pgClient.query('DROP TYPE "UserRole";');
    }

    // -------------------------------------------------------------------------
    // FIXTURE 10: Conflicting Views & Partial Domain Tables
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 10: Domain Object Collisions & Partial Tables ---');
    {
      await pgClient.query('CREATE VIEW users_templatedhub AS SELECT 1 AS id;');
      let res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Conflicting view occupying domain name triggers non-table conflict failure',
        res.verdict.includes('Conflicting non-table objects (views/sequences) detected with target names: users_templatedhub'),
        res.verdict
      );
      await pgClient.query('DROP VIEW users_templatedhub;');

      // Partial domain tables (3 of 11) with safe stop policy
      await pgClient.query(`
        CREATE TABLE users_templatedhub (id uuid primary key);
        CREATE TABLE assets_templatedhub (id uuid primary key);
        CREATE TABLE reviews_templatedhub (id uuid primary key);
      `);
      res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Partial domain tables fail and instruct safe stop and data preservation',
        res.verdict.includes('STOP: inspect existing objects and dependencies, and preserve data'),
        res.verdict
      );
      await pgClient.query(`
        DROP TABLE users_templatedhub;
        DROP TABLE assets_templatedhub;
        DROP TABLE reviews_templatedhub;
      `);
    }

    // -------------------------------------------------------------------------
    // FIXTURE 11: Pre-existing Routines (Requires manual review notice)
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 11: Pre-existing Routines Manual Review Policy ---');
    {
      await pgClient.query(`
        CREATE OR REPLACE FUNCTION public.resolve_storage_bucket()
        RETURNS TEXT
        LANGUAGE plpgsql
        STABLE
        SET search_path = pg_catalog, public, pg_temp
        AS $$ BEGIN RETURN 'sBLOOM_templateshub'; END; $$;
        ALTER FUNCTION public.resolve_storage_bucket() OWNER TO sbloom_owner;
      `);
      let res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Pre-existing routine triggers manual review notice without false canonical claims',
        res.verdict.includes('Pre-existing routine(s) detected with target names (1 of 19: resolve_storage_bucket). Manual review required'),
        res.verdict
      );
      await pgClient.query('DROP FUNCTION public.resolve_storage_bucket();');
    }

    // -------------------------------------------------------------------------
    // FIXTURE 12: Clean Baseline Environment -> PREFLIGHT_PASS
    // -------------------------------------------------------------------------
    console.log('\n--- FIXTURE 12: Clean Baseline Supabase Environment ---');
    {
      // Clean state: auth schema, auth.users table, clean Supabase roles, no domain tables
      const res = await executeWholePreflight(pgClient, preflightSql);
      assertTest(
        'Clean baseline environment yields PREFLIGHT_PASS across whole preflight execution',
        res.verdict === 'PREFLIGHT_PASS: Environment is clean and all prerequisites are verified. Safe to proceed with 02_create_schema.sql.',
        res.verdict
      );
    }

  } finally {
    if (pgClient) {
      await pgClient.end().catch(() => {});
    }
    console.log('\nStopping disposable PostgreSQL cluster...');
    try {
      execSync(`"${PG_CTL_BIN}" -D "${tempClusterDir}" stop -m immediate`, { stdio: 'ignore', timeout: 10000 });
    } catch (_) {}
    try {
      fs.rmSync(tempClusterDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log(`\n=== SQL EXECUTION TEST SUMMARY: ${failureCount === 0 ? 'ALL FIXTURES PASSED' : failureCount + ' FAILURES'} ===`);
  if (failureCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('[FATAL ERROR in test execution]:', err);
  process.exit(1);
});
