-- ==============================================================================
-- sBLOOM Template & Content Hub — Bootstrap & Master Ingestion RPC Verification
-- Script File: 08_verify_bootstrap_and_ingestion_rpc.sql
-- ==============================================================================
-- INSTRUCTIONS FOR OPERATOR:
-- 1. Run this script in Supabase SQL Editor AFTER executing 07_add_bootstrap_and_ingestion_rpc.sql.
-- 2. This script is 100% READ-ONLY. It contains NO INSERT, UPDATE, DELETE, or DDL statements.
-- 3. Verifies:
--      a. Exact routine signatures via to_regprocedure()
--      b. Routine ownership (sbloom_owner), SECURITY DEFINER, and safe search_path
--      c. Direct ACL privilege inspection via pg_proc.proacl + aclexplode():
--         - Direct EXECUTE required for service_role
--         - Direct EXECUTE strictly forbidden for PUBLIC (grantee=0), anon, authenticated, sbloom_app, sbloom_admin
--         - sbloom_owner authority verified via routine ownership (no direct ACL required)
--      d. Role configuration & privilege isolation for service_role and sbloom_admin
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Verify Exact Routine Signatures, Ownership, and Security Configuration
-- ------------------------------------------------------------------------------
WITH expected_signatures(signature, routine_name, expected_secdef, expected_owner) AS (
  VALUES 
    (
      'public.bootstrap_first_admin(text,text,boolean)',
      'bootstrap_first_admin',
      true,
      'sbloom_owner'
    ),
    (
      'public.bootstrap_social_post_asset_type(boolean)',
      'bootstrap_social_post_asset_type',
      true,
      'sbloom_owner'
    ),
    (
      'public.ingest_master_template(uuid,text,text,text,text,boolean,uuid,text,text,jsonb,integer,uuid,text,text,text,bigint,text)',
      'ingest_master_template',
      true,
      'sbloom_owner'
    )
),
resolved_routines AS (
  SELECT 
    es.signature,
    es.routine_name,
    es.expected_secdef,
    es.expected_owner,
    to_regprocedure(es.signature) AS proc_reg,
    p.oid AS proc_oid,
    r.rolname AS current_owner,
    p.prosecdef AS is_secdef,
    p.proconfig AS search_path_config
  FROM expected_signatures es
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(es.signature)
  LEFT JOIN pg_roles r ON r.oid = p.proowner
)
SELECT 
  routine_name,
  signature,
  CASE 
    WHEN proc_reg IS NULL THEN 'FAIL: Exact Routine Signature Missing or Overload Mismatch'
    WHEN current_owner != expected_owner THEN 'FAIL: Incorrect Owner (' || COALESCE(current_owner, 'NONE') || ')'
    WHEN is_secdef != expected_secdef THEN 'FAIL: Not SECURITY DEFINER'
    WHEN search_path_config IS NULL OR NOT ('search_path=pg_catalog, public, pg_temp' = ANY(search_path_config)) THEN 'FAIL: Insecure search_path'
    ELSE 'PASS'
  END AS status,
  COALESCE(current_owner, 'NONE') AS owner,
  COALESCE(is_secdef, false) AS security_definer,
  search_path_config
FROM resolved_routines
ORDER BY routine_name;

-- ------------------------------------------------------------------------------
-- 2. Verify Explicit Expected and Forbidden Direct EXECUTE Privileges via aclexplode()
-- ------------------------------------------------------------------------------
-- Rules:
-- 1. Uses pg_proc.proacl and aclexplode() (never calls has_function_privilege with PUBLIC).
-- 2. grantee = 0 represents the global pseudo-role PUBLIC.
-- 3. Direct EXECUTE is REQUIRED for service_role.
-- 4. Direct EXECUTE is FORBIDDEN for PUBLIC, anon, authenticated, sbloom_app, and sbloom_admin.
-- 5. sbloom_owner authority is verified via routine ownership in Section 1 (no direct ACL required).
-- ------------------------------------------------------------------------------
WITH target_routines(signature, routine_name) AS (
  VALUES 
    ('public.bootstrap_first_admin(text,text,boolean)', 'bootstrap_first_admin'),
    ('public.bootstrap_social_post_asset_type(boolean)', 'bootstrap_social_post_asset_type'),
    ('public.ingest_master_template(uuid,text,text,text,text,boolean,uuid,text,text,jsonb,integer,uuid,text,text,text,bigint,text)', 'ingest_master_template')
),
role_audit(role_name, is_expected, description) AS (
  VALUES 
    ('service_role', true, 'Privileged backend server role (operational CLI/ingestion)'),
    ('PUBLIC', false, 'Global pseudo-role representing all users (grantee = 0)'),
    ('anon', false, 'Supabase anonymous client role'),
    ('authenticated', false, 'Supabase standard authenticated client role'),
    ('sbloom_app', false, 'Standard runtime app role (must NOT have direct bootstrap/ingestion authority)'),
    ('sbloom_admin', false, 'Administrative purge role (must NOT have direct ingestion/bootstrap authority)')
),
direct_privileges AS (
  SELECT 
    tr.routine_name,
    ra.role_name,
    ra.is_expected,
    ra.description,
    to_regprocedure(tr.signature) AS proc_reg,
    CASE 
      WHEN to_regprocedure(tr.signature) IS NULL THEN false
      WHEN ra.role_name = 'PUBLIC' THEN
        EXISTS (
          SELECT 1 
            FROM pg_proc p,
                 LATERAL aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) acl
           WHERE p.oid = to_regprocedure(tr.signature)
             AND acl.grantee = 0 
             AND acl.privilege_type = 'EXECUTE'
        )
      ELSE
        EXISTS (
          SELECT 1 
            FROM pg_proc p,
                 LATERAL aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) acl,
                 pg_roles r
           WHERE p.oid = to_regprocedure(tr.signature)
             AND r.rolname = ra.role_name
             AND acl.grantee = r.oid 
             AND acl.privilege_type = 'EXECUTE'
        )
    END AS has_direct_execute,
    CASE 
      WHEN ra.role_name = 'PUBLIC' THEN true
      ELSE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ra.role_name)
    END AS role_exists
  FROM target_routines tr
  CROSS JOIN role_audit ra
)
SELECT 
  routine_name,
  role_name,
  description,
  CASE 
    WHEN proc_reg IS NULL THEN 'SKIP: Routine Not Installed'
    WHEN role_name = 'service_role' AND NOT role_exists THEN 'SKIP: service_role does not exist in local environment'
    WHEN is_expected AND has_direct_execute THEN 'PASS: Expected Direct Privilege Granted'
    WHEN is_expected AND NOT has_direct_execute THEN 'FAIL: Expected Direct Privilege Missing'
    WHEN NOT is_expected AND NOT role_exists THEN 'PASS: Role Absent in Database (No Exposure)'
    WHEN NOT is_expected AND NOT has_direct_execute THEN 'PASS: Forbidden Direct Privilege Denied'
    WHEN NOT is_expected AND has_direct_execute THEN 'FAIL: Forbidden Direct Privilege Exposed'
  END AS compliance_check
FROM direct_privileges
ORDER BY routine_name, is_expected DESC, role_name;

-- ------------------------------------------------------------------------------
-- 3. Verify Role Configuration & Security Boundaries
-- ------------------------------------------------------------------------------
SELECT 
  'service_role presence & privilege isolation' AS check_name,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN 'SKIP: service_role does not exist in local environment'
    WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_owner') THEN 'FAIL: sbloom_owner role missing'
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_admin') AND pg_has_role('service_role', 'sbloom_admin', 'member') THEN 'FAIL: service_role unexpectedly inherits sbloom_admin rights'
    ELSE 'PASS: service_role isolated from sbloom_admin and configured for operational RPC access'
  END AS status,
  'Ensures operational CLI/ingestion scripts execute with direct service_role grants without acquiring sbloom_admin purge capabilities' AS notes;
