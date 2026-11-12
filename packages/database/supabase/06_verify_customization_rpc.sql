-- ==============================================================================
-- sBLOOM Template & Content Hub — Customization RPC Verification Script
-- Script File: 06_verify_customization_rpc.sql
-- ==============================================================================
-- INSTRUCTIONS FOR OPERATOR:
-- 1. Run this script in Supabase SQL Editor AFTER executing 05_add_customization_rpc_functions.sql.
-- 2. This script is 100% READ-ONLY. It contains NO INSERT, UPDATE, DELETE, or DDL statements.
-- 3. Verifies:
--      a. Exact routine signatures via to_regprocedure()
--      b. Ownership (sbloom_owner), SECURITY DEFINER, and safe search_path
--      c. Explicit expected (sbloom_app) and forbidden (PUBLIC, anon, authenticated, sbloom_admin) EXECUTE privileges
--      d. Role membership: service_role -> sbloom_app inheritance
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Verify Exact Routine Signatures, Ownership, and Security Configuration
-- ------------------------------------------------------------------------------
WITH expected_signatures(signature, routine_name, expected_secdef, expected_owner) AS (
  VALUES 
    (
      'public.create_customization(uuid,text,uuid,uuid,uuid,text,jsonb,integer)',
      'create_customization',
      true,
      'sbloom_owner'
    ),
    (
      'public.save_customization_revision(uuid,uuid,text,jsonb,integer)',
      'save_customization_revision',
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
-- 2. Verify Explicit Expected and Forbidden EXECUTE Privileges
-- ------------------------------------------------------------------------------
WITH target_routines(signature, routine_name) AS (
  VALUES 
    ('public.create_customization(uuid,text,uuid,uuid,uuid,text,jsonb,integer)', 'create_customization'),
    ('public.save_customization_revision(uuid,uuid,text,jsonb,integer)', 'save_customization_revision')
),
role_audit(role_name, is_expected, description) AS (
  VALUES 
    ('sbloom_app', true, 'Authoritative application runtime role'),
    ('sbloom_owner', true, 'Routine owner role'),
    ('PUBLIC', false, 'Unauthenticated / public global pseudo-role'),
    ('anon', false, 'Supabase anonymous client role'),
    ('authenticated', false, 'Supabase standard authenticated client role'),
    ('sbloom_admin', false, 'Administrative role (must not have direct routine bypass)')
)
SELECT 
  tr.routine_name,
  ra.role_name,
  ra.description,
  CASE 
    WHEN to_regprocedure(tr.signature) IS NULL THEN 'SKIP: Routine Not Installed'
    WHEN ra.is_expected AND has_function_privilege(ra.role_name, to_regprocedure(tr.signature), 'EXECUTE') THEN 'PASS: Expected Privilege Granted'
    WHEN ra.is_expected AND NOT has_function_privilege(ra.role_name, to_regprocedure(tr.signature), 'EXECUTE') THEN 'FAIL: Expected Privilege Missing'
    WHEN NOT ra.is_expected AND NOT has_function_privilege(ra.role_name, to_regprocedure(tr.signature), 'EXECUTE') THEN 'PASS: Forbidden Privilege Denied'
    WHEN NOT ra.is_expected AND has_function_privilege(ra.role_name, to_regprocedure(tr.signature), 'EXECUTE') THEN 'FAIL: Forbidden Privilege Exposed'
  END AS compliance_check
FROM target_routines tr
CROSS JOIN role_audit ra
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ra.role_name)
   OR ra.role_name = 'PUBLIC'
ORDER BY tr.routine_name, ra.is_expected DESC, ra.role_name;

-- ------------------------------------------------------------------------------
-- 3. Verify service_role -> sbloom_app Role Membership
-- ------------------------------------------------------------------------------
SELECT 
  'service_role -> sbloom_app membership' AS check_name,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN 'SKIP: service_role does not exist in local environment'
    WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app') THEN 'FAIL: sbloom_app role missing'
    WHEN pg_has_role('service_role', 'sbloom_app', 'member') THEN 'PASS: service_role inherits sbloom_app execution rights'
    ELSE 'FAIL: service_role is NOT a member of sbloom_app'
  END AS status,
  'Ensures PostgREST runtime key executes RPC routines securely via sbloom_app membership without direct grants' AS notes;
