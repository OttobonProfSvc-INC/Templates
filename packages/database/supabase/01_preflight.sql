-- ==============================================================================
-- Script 1: Preflight Diagnostic & Conflict Detection
-- Target: Supabase Managed PostgreSQL
-- Suffix Standard: _templatedhub (11 domain tables)
-- Safety: 100% READ-ONLY. Never modifies, drops, or alters any data or objects.
-- Execution: Paste and run in Supabase Dashboard -> SQL Editor before 02_create_schema.sql.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DATABASE & SERVER ENVIRONMENT
-- Inspects session, version, and executing user privileges.
-- ------------------------------------------------------------------------------
SELECT 
  current_database() AS database_name,
  current_schema() AS current_schema,
  current_user AS current_user,
  session_user AS session_user,
  current_setting('search_path') AS active_search_path,
  COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = CURRENT_USER), false) AS is_superuser,
  COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = CURRENT_USER), false) AS has_createrole,
  has_schema_privilege(CURRENT_USER, 'public'::regnamespace, 'CREATE') AS has_public_create,
  has_schema_privilege(CURRENT_USER, 'public'::regnamespace, 'USAGE') AS has_public_usage,
  version() AS postgres_version;

-- ------------------------------------------------------------------------------
-- 2. EXACT DOMAIN TABLE CONFLICT CHECK
-- Checks whether any of the exact 11 expected _templatedhub tables already exist.
-- Avoids wildcard checks. Any existing object here requires manual review.
-- Policy: STOP: inspect existing objects and dependencies, and preserve data.
--         No automatic dropping or recreation.
-- ------------------------------------------------------------------------------
WITH expected_tables(table_name) AS (
  VALUES 
    ('users_templatedhub'),
    ('asset_types_templatedhub'),
    ('assets_templatedhub'),
    ('asset_revisions_templatedhub'),
    ('asset_files_templatedhub'),
    ('reviews_templatedhub'),
    ('audit_events_templatedhub'),
    ('collections_templatedhub'),
    ('collection_assets_templatedhub'),
    ('asset_usages_templatedhub'),
    ('storage_deletion_jobs_templatedhub')
)
SELECT 
  e.table_name,
  CASE 
    WHEN c.oid IS NOT NULL THEN 'CONFLICT_EXISTS (Inspect and preserve data)'
    ELSE 'CLEAN_AVAILABLE'
  END AS status,
  COALESCE(c.relkind::text, 'N/A') AS object_kind,
  COALESCE(r.rolname, 'NONE') AS owner,
  COALESCE(c.relrowsecurity, false) AS rls_enabled
FROM expected_tables e
LEFT JOIN pg_class c ON c.relname = e.table_name AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_roles r ON r.oid = c.relowner
ORDER BY e.table_name;

-- ------------------------------------------------------------------------------
-- 3. LEGACY UNPREFIXED TABLE CONFLICT CHECK
-- Checks whether any legacy unprefixed tables exist in schema 'public'.
-- Policy: STOP: inspect existing objects and dependencies, and preserve data.
--         No automatic dropping or recreation.
-- ------------------------------------------------------------------------------
WITH legacy_tables(table_name) AS (
  VALUES 
    ('users'),
    ('asset_types'),
    ('assets'),
    ('asset_revisions'),
    ('asset_files'),
    ('reviews'),
    ('audit_events'),
    ('collections'),
    ('collection_assets'),
    ('asset_usages'),
    ('storage_deletion_jobs')
)
SELECT 
  l.table_name,
  CASE 
    WHEN c.oid IS NOT NULL THEN 'LEGACY_OBJECT_DETECTED (Preserve data; do not drop)'
    ELSE 'NOT_PRESENT'
  END AS status,
  COALESCE(c.relkind::text, 'N/A') AS object_kind,
  COALESCE(r.rolname, 'NONE') AS owner
FROM legacy_tables l
LEFT JOIN pg_class c ON c.relname = l.table_name AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_roles r ON r.oid = c.relowner
WHERE c.oid IS NOT NULL
ORDER BY l.table_name;

-- ------------------------------------------------------------------------------
-- 4. CONFLICTING VIEWS, MATERIALIZED VIEWS, AND SEQUENCES
-- Detects non-table catalog objects in 'public' colliding with expected names.
-- ------------------------------------------------------------------------------
SELECT 
  c.relname AS conflicting_object_name,
  CASE c.relkind
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED_VIEW'
    WHEN 'S' THEN 'SEQUENCE'
    WHEN 'f' THEN 'FOREIGN_TABLE'
    WHEN 'p' THEN 'PARTITIONED_TABLE'
    ELSE c.relkind::text
  END AS conflicting_kind,
  r.rolname AS owner
FROM pg_class c
JOIN pg_roles r ON r.oid = c.relowner
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN (
    'users_templatedhub', 'asset_types_templatedhub', 'assets_templatedhub',
    'asset_revisions_templatedhub', 'asset_files_templatedhub', 'reviews_templatedhub',
    'audit_events_templatedhub', 'collections_templatedhub', 'collection_assets_templatedhub',
    'asset_usages_templatedhub', 'storage_deletion_jobs_templatedhub'
  )
  AND c.relkind != 'r';

-- ------------------------------------------------------------------------------
-- 5. EXACT ENUM TYPES & LABELS INSPECTION
-- Definition-level inspection of schema-qualified enum types in 'public'.
-- Detects missing labels, additional labels, incorrect order, and non-enum types.
-- Casts pg_enum.enumlabel to text inside array_agg for correct array type comparison.
-- ------------------------------------------------------------------------------
WITH expected_enums(typname, expected_labels) AS (
  VALUES 
    ('UserRole', ARRAY['ADMIN', 'CONTRIBUTOR']::text[]),
    ('AssetStatus', ARRAY['DRAFT', 'PUBLISHED', 'ARCHIVED']::text[]),
    ('RevisionStatus', ARRAY['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED']::text[]),
    ('FileRole', ARRAY['PRIMARY_ENTRY', 'SOURCE_ARCHIVE', 'THUMBNAIL', 'PREVIEW_IMAGE', 'ATTACHMENT']::text[]),
    ('ReviewDecision', ARRAY['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']::text[]),
    ('UsageAction', ARRAY['VIEW', 'DOWNLOAD', 'PREVIEW', 'REMIX']::text[]),
    ('JobStatus', ARRAY['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']::text[])
),
actual_types AS (
  SELECT 
    t.typname,
    t.oid AS typid,
    t.typtype,
    CASE 
      WHEN t.typtype = 'e' THEN array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
      ELSE NULL
    END AS actual_labels
  FROM pg_type t
  LEFT JOIN pg_enum e ON t.oid = e.enumtypid
  WHERE t.typnamespace = 'public'::regnamespace
    AND t.typname IN ('UserRole', 'AssetStatus', 'RevisionStatus', 'FileRole', 'ReviewDecision', 'UsageAction', 'JobStatus')
  GROUP BY t.typname, t.oid, t.typtype
)
SELECT 
  ee.typname AS enum_type,
  CASE 
    WHEN at.typname IS NULL THEN 'NOT_PRESENT (Will be created)'
    WHEN at.typtype != 'e' THEN 'CONFLICT_NON_ENUM_TYPE (Occupied by typtype: ' || at.typtype::text || ')'
    WHEN at.actual_labels = ee.expected_labels THEN 'EXISTS_COMPATIBLE'
    WHEN NOT (at.actual_labels @> ee.expected_labels) AND NOT (at.actual_labels <@ ee.expected_labels) 
      THEN 'EXISTS_INCOMPATIBLE (Missing and additional labels detected)'
    WHEN NOT (at.actual_labels @> ee.expected_labels) 
      THEN 'EXISTS_INCOMPATIBLE (Missing required labels)'
    WHEN NOT (at.actual_labels <@ ee.expected_labels) 
      THEN 'EXISTS_INCOMPATIBLE (Additional unexpected labels detected)'
    WHEN at.actual_labels != ee.expected_labels 
      THEN 'EXISTS_INCOMPATIBLE (Label order mismatch)'
    ELSE 'EXISTS_INCOMPATIBLE'
  END AS status,
  array_to_string(ee.expected_labels, ', ') AS expected_labels,
  COALESCE(array_to_string(at.actual_labels, ', '), 'NONE (Non-enum or absent)') AS current_labels
FROM expected_enums ee
LEFT JOIN actual_types at ON at.typname = ee.typname
ORDER BY ee.typname;

-- ------------------------------------------------------------------------------
-- 6. EXISTING CUSTOM FUNCTIONS & PROCEDURES INSPECTION
-- Inspects routines in schema 'public' matching expected sBLOOM functions.
-- Compares signatures, return types, security attributes, owners, search_path,
-- and execution grants against canonical definitions.
-- Note: Does NOT label absent routines SECURITY INVOKER (displays NULL).
-- Note: Pre-existing routines require manual review; routine body verification is not performed in preflight.
-- ------------------------------------------------------------------------------
WITH expected_routines(proname, expected_sec, expected_owner, expected_rettype) AS (
  VALUES 
    ('resolve_storage_bucket', 'SECURITY INVOKER', 'sbloom_owner', 'text'),
    ('check_revision_review_linkage', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
    ('record_review_decision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
    ('submit_draft_revision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
    ('publish_asset_revision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
    ('allocate_next_revision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
    ('archive_asset', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
    ('unarchive_asset', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
    ('delete_draft_revision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
    ('process_asset_revision_immutability', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
    ('process_asset_revision_delete', 'SECURITY INVOKER', 'sbloom_owner', 'trigger'),
    ('process_asset_file_immutability', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
    ('process_protect_asset_revision_counter', 'SECURITY INVOKER', 'sbloom_owner', 'trigger'),
    ('process_asset_revision_insert_defaults', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
    ('check_asset_published_consistency', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
    ('check_revision_published_consistency', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
    ('process_storage_deletion_job_transition', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
    ('admin_purge_asset', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
    ('process_audit_events_immutable', 'SECURITY DEFINER', 'sbloom_owner', 'trigger')
)
SELECT 
  er.proname,
  CASE 
    WHEN p.oid IS NULL THEN 'NOT_PRESENT (Will be created)'
    WHEN pg_get_function_result(p.oid) != er.expected_rettype THEN 'CONFLICT_SIGNATURE_MISMATCH (Return type: ' || pg_get_function_result(p.oid) || ')'
    WHEN (CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END) != er.expected_sec THEN 'CONFLICT_SECURITY_MISMATCH'
    WHEN r.rolname != er.expected_owner THEN 'CONFLICT_OWNER_MISMATCH (Current: ' || COALESCE(r.rolname, 'NONE') || ')'
    WHEN NOT (COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog, public, pg_temp']) THEN 'CONFLICT_SEARCH_PATH_INSECURE'
    WHEN er.proname = 'admin_purge_asset' AND (
      (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app') AND has_function_privilege((SELECT oid FROM pg_roles WHERE rolname = 'sbloom_app'), p.oid, 'EXECUTE')) OR
      (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AND has_function_privilege((SELECT oid FROM pg_roles WHERE rolname = 'service_role'), p.oid, 'EXECUTE')) OR
      has_function_privilege('public', p.oid, 'EXECUTE')
    ) THEN 'CONFLICT_UNSAFE_EXECUTE_GRANT'
    ELSE 'EXISTS (Manual review required before schema creation)'
  END AS status,
  COALESCE(pg_get_function_identity_arguments(p.oid), 'N/A') AS argument_signature,
  COALESCE(pg_get_function_result(p.oid), er.expected_rettype) AS return_type,
  CASE 
    WHEN p.oid IS NULL THEN NULL
    WHEN p.prosecdef THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END AS security_attribute,
  COALESCE(r.rolname, 'N/A') AS current_owner,
  COALESCE(array_to_string(p.proconfig, '; '), 'NONE') AS current_search_path
FROM expected_routines er
LEFT JOIN pg_proc p ON p.proname = er.proname AND p.pronamespace = 'public'::regnamespace
LEFT JOIN pg_roles r ON r.oid = p.proowner
ORDER BY er.proname;

-- ------------------------------------------------------------------------------
-- 7. ROLES, CREATEROLE PRIVILEGE & SECURITY BOUNDARY AUDIT
-- Checks provisioning readiness for ALL THREE intended roles:
--   - sbloom_owner (table/routine owner)
--   - sbloom_admin (maintenance/purge role)
--   - sbloom_app (runtime least-privilege DML boundary)
-- Verifies ownership-transfer requirements for sbloom_owner (MEMBER + CREATE on public).
-- Verifies actual grant readiness for sbloom_app to service_role (MEMBER WITH ADMIN OPTION).
-- Audits unexpected direct and indirect access to sbloom_admin and sbloom_owner.
-- Checks sbloom_app's own administrative access before it is granted to service_role.
-- Preserves Supabase-managed roles.
-- ------------------------------------------------------------------------------

-- 7.1 Role Inventory & Provisioning Prerequisites
WITH expected_roles(rolname, is_sbloom_role, requires_nologin) AS (
  VALUES 
    ('postgres', false, false),
    ('service_role', false, false),
    ('authenticated', false, false),
    ('anon', false, false),
    ('sbloom_owner', true, true),
    ('sbloom_admin', true, true),
    ('sbloom_app', true, true)
),
current_user_privs AS (
  SELECT 
    COALESCE(rolcreaterole, false) OR COALESCE(rolsuper, false) AS can_manage_roles,
    COALESCE(rolsuper, false) AS is_superuser
  FROM pg_roles
  WHERE rolname = CURRENT_USER
)
SELECT 
  er.rolname,
  CASE 
    WHEN r.oid IS NOT NULL THEN 'EXISTS'
    WHEN er.is_sbloom_role THEN 'AWAITING_PROVISIONING'
    ELSE 'SUPABASE_ROLE_NOT_DETECTED'
  END AS presence_status,
  COALESCE(r.rolcanlogin, false) AS can_login,
  COALESCE(r.rolsuper, false) AS is_superuser,
  COALESCE(r.rolcreaterole, false) AS has_createrole,
  COALESCE(r.rolbypassrls, false) AS bypasses_rls,
  CASE 
    WHEN r.oid IS NULL AND er.is_sbloom_role THEN
      CASE 
        WHEN (SELECT can_manage_roles FROM current_user_privs) THEN 'READY_TO_PROVISION (Current user has CREATEROLE/SUPERUSER)'
        ELSE 'BLOCKER: Current user lacks CREATEROLE/SUPERUSER to create role'
      END
    WHEN r.oid IS NOT NULL AND er.is_sbloom_role AND r.rolcanlogin THEN
      'BLOCKER: Non-login role has LOGIN privilege enabled (must be NOLOGIN)'
    WHEN r.oid IS NOT NULL AND er.rolname = 'sbloom_owner' THEN
      CASE 
        WHEN NOT ((SELECT is_superuser FROM current_user_privs) OR pg_has_role(CURRENT_USER, r.oid, 'SET'))
          THEN 'BLOCKER: Current user cannot assign ownership to sbloom_owner (must have SET capability on sbloom_owner or be superuser)'
        WHEN NOT has_schema_privilege(r.oid, 'public'::regnamespace, 'CREATE')
          THEN 'BLOCKER: sbloom_owner lacks CREATE privilege on schema "public" (required for ownership transfer)'
        ELSE 'READY (Ownership transfer prerequisites verified)'
      END
    WHEN r.oid IS NOT NULL AND er.rolname = 'sbloom_app' THEN
      CASE 
        WHEN (SELECT is_superuser FROM current_user_privs) OR pg_has_role(CURRENT_USER, r.oid, 'MEMBER WITH ADMIN OPTION')
          THEN 'READY (Grant readiness to service_role verified)'
        ELSE 'BLOCKER: Current user lacks ADMIN OPTION on sbloom_app to grant to service_role'
      END
    WHEN r.oid IS NOT NULL THEN 'READY'
    ELSE 'NOTICE: Supabase managed role not found'
  END AS provisioning_readiness,
  ARRAY(
    SELECT m.rolname 
    FROM pg_auth_members am 
    JOIN pg_roles m ON m.oid = am.roleid 
    WHERE am.member = r.oid
  ) AS directly_inherited_roles
FROM expected_roles er
LEFT JOIN pg_roles r ON r.rolname = er.rolname
ORDER BY er.is_sbloom_role DESC, er.rolname;

-- 7.2 Security Boundary Audit: Unauthorized Role Memberships & Elevated Attributes
-- 1. service_role must NOT possess sbloom_admin or sbloom_owner
SELECT 
  cand.rolname AS audited_role,
  target.rolname AS target_privileged_role,
  'FAIL: Unexpected membership in administrative role' AS security_alert,
  'service_role is intended to receive sbloom_app only, not sbloom_admin or sbloom_owner' AS explanation
FROM pg_roles cand
CROSS JOIN pg_roles target
WHERE cand.rolname = 'service_role'
  AND target.rolname IN ('sbloom_admin', 'sbloom_owner')
  AND pg_has_role(cand.oid, target.oid, 'MEMBER')

UNION ALL

-- 2. sbloom_app must NOT possess sbloom_admin or sbloom_owner (before grant to service_role)
SELECT 
  cand.rolname AS audited_role,
  target.rolname AS target_privileged_role,
  'FAIL: sbloom_app possesses administrative role membership' AS security_alert,
  'sbloom_app must not have access to sbloom_admin or sbloom_owner before being granted to service_role' AS explanation
FROM pg_roles cand
CROSS JOIN pg_roles target
WHERE cand.rolname = 'sbloom_app'
  AND target.rolname IN ('sbloom_admin', 'sbloom_owner')
  AND pg_has_role(cand.oid, target.oid, 'MEMBER')

UNION ALL

-- 3. sbloom_admin must NOT possess sbloom_owner
SELECT 
  cand.rolname AS audited_role,
  target.rolname AS target_privileged_role,
  'FAIL: sbloom_admin possesses sbloom_owner membership' AS security_alert,
  'sbloom_admin must not possess sbloom_owner' AS explanation
FROM pg_roles cand
CROSS JOIN pg_roles target
WHERE cand.rolname = 'sbloom_admin'
  AND target.rolname = 'sbloom_owner'
  AND pg_has_role(cand.oid, target.oid, 'MEMBER')

UNION ALL

-- 4. anon and authenticated must NOT possess sbloom_owner, sbloom_admin, or sbloom_app
SELECT 
  cand.rolname AS audited_role,
  target.rolname AS target_privileged_role,
  'FAIL: Client role has unexpected membership in sbloom role' AS security_alert,
  'anon and authenticated must not possess membership in sbloom_owner, sbloom_admin, or sbloom_app' AS explanation
FROM pg_roles cand
CROSS JOIN pg_roles target
WHERE cand.rolname IN ('anon', 'authenticated')
  AND target.rolname IN ('sbloom_owner', 'sbloom_admin', 'sbloom_app')
  AND pg_has_role(cand.oid, target.oid, 'MEMBER')

UNION ALL

-- 5. Non-login roles must NOT have LOGIN enabled
SELECT 
  r.rolname AS audited_role,
  'N/A' AS target_privileged_role,
  'FAIL: Non-login role has LOGIN privilege enabled' AS security_alert,
  'sbloom_owner, sbloom_admin, and sbloom_app must be NOLOGIN' AS explanation
FROM pg_roles r
WHERE r.rolname IN ('sbloom_owner', 'sbloom_admin', 'sbloom_app')
  AND r.rolcanlogin = true

UNION ALL

-- 6. sBLOOM roles must NOT have elevated attributes (SUPERUSER, CREATEROLE, BYPASSRLS)
SELECT 
  r.rolname AS audited_role,
  'N/A' AS target_privileged_role,
  'FAIL: sBLOOM role has elevated administrative attributes' AS security_alert,
  'sbloom_owner, sbloom_admin, and sbloom_app must not have SUPERUSER, CREATEROLE, or BYPASSRLS' AS explanation
FROM pg_roles r
WHERE r.rolname IN ('sbloom_owner', 'sbloom_admin', 'sbloom_app')
  AND (r.rolsuper = true OR r.rolcreaterole = true OR r.rolbypassrls = true);

-- ------------------------------------------------------------------------------
-- 8. SUPABASE AUTH DEPENDENCY & CREATION PERMISSIONS INSPECTION
-- Confirms that schema auth and table auth.users exist and are accessible.
-- Confirms that auth.users.id exists and is UUID.
-- Uses OID joins to prevent lookup exceptions if objects are missing.
-- Checks that CURRENT_USER possesses permissions actually required by 02_create_schema.sql.
-- ------------------------------------------------------------------------------
SELECT 
  v.check_item,
  v.target_object,
  v.required_permission,
  CASE 
    WHEN v.check_item = 'auth_schema' THEN 
      CASE WHEN n.oid IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END
    WHEN v.check_item = 'auth_users_table' THEN 
      CASE WHEN c.oid IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END
    WHEN v.check_item = 'auth_schema_usage' THEN 
      CASE WHEN n.oid IS NOT NULL AND has_schema_privilege(CURRENT_USER, n.oid, 'USAGE') THEN 'GRANTED' ELSE 'MISSING' END
    WHEN v.check_item = 'auth_users_select' THEN 
      CASE WHEN c.oid IS NOT NULL AND has_table_privilege(CURRENT_USER, c.oid, 'SELECT') THEN 'GRANTED' ELSE 'MISSING' END
    WHEN v.check_item = 'auth_users_id_uuid' THEN 
      CASE 
        WHEN c.oid IS NOT NULL AND EXISTS (
          SELECT 1 
          FROM pg_attribute a 
          JOIN pg_type t ON t.oid = a.atttypid 
          WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped AND t.typname = 'uuid'
        ) THEN 'VALID (UUID)' 
        ELSE 'INVALID_OR_MISSING' 
      END
    WHEN v.check_item = 'public_schema_create' THEN 
      CASE WHEN has_schema_privilege(CURRENT_USER, 'public'::regnamespace, 'CREATE') THEN 'GRANTED' ELSE 'MISSING' END
    WHEN v.check_item = 'public_schema_usage' THEN 
      CASE WHEN has_schema_privilege(CURRENT_USER, 'public'::regnamespace, 'USAGE') THEN 'GRANTED' ELSE 'MISSING' END
    WHEN v.check_item = 'role_management_createrole' THEN 
      CASE WHEN COALESCE((SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname = CURRENT_USER), false) THEN 'GRANTED' ELSE 'MISSING' END
    ELSE 'UNKNOWN'
  END AS current_status,
  CASE 
    WHEN v.check_item = 'auth_schema' AND n.oid IS NULL THEN 'BLOCKER: Schema "auth" does not exist in database catalog'
    WHEN v.check_item = 'auth_users_table' AND c.oid IS NULL THEN 'BLOCKER: Supabase Auth dependency "auth.users" was not found in catalog'
    WHEN v.check_item = 'auth_schema_usage' AND NOT (n.oid IS NOT NULL AND has_schema_privilege(CURRENT_USER, n.oid, 'USAGE')) THEN 'BLOCKER: Current user lacks USAGE on "auth" schema'
    WHEN v.check_item = 'auth_users_select' AND NOT (c.oid IS NOT NULL AND has_table_privilege(CURRENT_USER, c.oid, 'SELECT')) THEN 'BLOCKER: Current user lacks SELECT on "auth.users"'
    WHEN v.check_item = 'auth_users_id_uuid' AND NOT (
      c.oid IS NOT NULL AND EXISTS (
        SELECT 1 
        FROM pg_attribute a 
        JOIN pg_type t ON t.oid = a.atttypid 
        WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped AND t.typname = 'uuid'
      )
    ) THEN 'BLOCKER: Supabase Auth dependency "auth.users" column "id" is missing or not of type UUID'
    WHEN v.check_item = 'public_schema_create' AND NOT has_schema_privilege(CURRENT_USER, 'public'::regnamespace, 'CREATE') THEN 'BLOCKER: Current user lacks CREATE on "public" schema to create tables/functions'
    WHEN v.check_item = 'public_schema_usage' AND NOT has_schema_privilege(CURRENT_USER, 'public'::regnamespace, 'USAGE') THEN 'BLOCKER: Current user lacks USAGE on "public" schema'
    WHEN v.check_item = 'role_management_createrole' AND NOT COALESCE((SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname = CURRENT_USER), false) AND (
      NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_owner') OR
      NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_admin') OR
      NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app')
    ) THEN 'BLOCKER: Current user lacks CREATEROLE and one or more intended roles do not exist'
    ELSE 'OK'
  END AS diagnostic_finding
FROM (
  VALUES 
    ('auth_schema', 'schema auth', 'SCHEMA_EXISTENCE'),
    ('auth_users_table', 'table auth.users', 'TABLE_EXISTENCE'),
    ('auth_schema_usage', 'schema auth', 'USAGE'),
    ('auth_users_select', 'table auth.users', 'SELECT'),
    ('auth_users_id_uuid', 'auth.users.id', 'UUID_TYPE'),
    ('public_schema_create', 'schema public', 'CREATE'),
    ('public_schema_usage', 'schema public', 'USAGE'),
    ('role_management_createrole', 'current_user', 'CREATEROLE_OR_SUPERUSER')
) AS v(check_item, target_object, required_permission)
LEFT JOIN pg_namespace n ON n.nspname = 'auth'
LEFT JOIN pg_class c ON c.relname = 'users' AND c.relnamespace = n.oid;

-- ------------------------------------------------------------------------------
-- 9. PREFLIGHT DIAGNOSTIC VERDICT
-- Evaluates all preflight criteria hierarchically: FAILURES ARE EVALUATED BEFORE NOTICES.
-- Checks:
--   - Supabase Auth dependency (auth schema, auth.users presence, permissions, UUID id)
--   - Current user schema creation permissions on 'public' (CREATE, USAGE)
--   - Role provisioning prerequisites for ALL THREE intended roles
--   - Ownership-transfer prerequisites for sbloom_owner (MEMBER + CREATE on public)
--   - Grant readiness for sbloom_app (MEMBER WITH ADMIN OPTION)
--   - Unsafe direct and indirect memberships in sbloom_admin / sbloom_owner
--   - sbloom_app's own administrative access isolation
--   - Conflicting non-table objects (views/sequences)
--   - Definition-level enum checks (missing, additional, order, non-enum)
--   - Domain table conflicts (stop and preserve data; no automatic dropping)
--   - Routine signature, owner, search_path, and execution grant compatibility
--   - Unresolved legacy tables (evaluated as documented notice after all failures)
--   - Pre-existing routines (evaluated as manual review notice; no false canonical claims)
-- Returns an authoritative verdict and explicit blocker explanations.
-- Does NOT report PASS if any required check is failed or unresolved.
-- ------------------------------------------------------------------------------
WITH 
  existing_tables AS (
    SELECT c.relname 
    FROM pg_class c 
    WHERE c.relnamespace = 'public'::regnamespace 
      AND c.relname IN (
        'users_templatedhub', 'asset_types_templatedhub', 'assets_templatedhub',
        'asset_revisions_templatedhub', 'asset_files_templatedhub', 'reviews_templatedhub',
        'audit_events_templatedhub', 'collections_templatedhub', 'collection_assets_templatedhub',
        'asset_usages_templatedhub', 'storage_deletion_jobs_templatedhub'
      )
  ),
  legacy_tables AS (
    SELECT c.relname 
    FROM pg_class c 
    WHERE c.relnamespace = 'public'::regnamespace 
      AND c.relname IN (
        'users', 'asset_types', 'assets', 'asset_revisions', 'asset_files',
        'reviews', 'audit_events', 'collections', 'collection_assets',
        'asset_usages', 'storage_deletion_jobs'
      )
  ),
  non_table_conflicts AS (
    SELECT c.relname 
    FROM pg_class c 
    WHERE c.relnamespace = 'public'::regnamespace 
      AND c.relname IN (
        'users_templatedhub', 'asset_types_templatedhub', 'assets_templatedhub',
        'asset_revisions_templatedhub', 'asset_files_templatedhub', 'reviews_templatedhub',
        'audit_events_templatedhub', 'collections_templatedhub', 'collection_assets_templatedhub',
        'asset_usages_templatedhub', 'storage_deletion_jobs_templatedhub'
      )
      AND c.relkind != 'r'
  ),
  expected_enums(typname, expected_labels) AS (
    VALUES 
      ('UserRole', ARRAY['ADMIN', 'CONTRIBUTOR']::text[]),
      ('AssetStatus', ARRAY['DRAFT', 'PUBLISHED', 'ARCHIVED']::text[]),
      ('RevisionStatus', ARRAY['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED']::text[]),
      ('FileRole', ARRAY['PRIMARY_ENTRY', 'SOURCE_ARCHIVE', 'THUMBNAIL', 'PREVIEW_IMAGE', 'ATTACHMENT']::text[]),
      ('ReviewDecision', ARRAY['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']::text[]),
      ('UsageAction', ARRAY['VIEW', 'DOWNLOAD', 'PREVIEW', 'REMIX']::text[]),
      ('JobStatus', ARRAY['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']::text[])
  ),
  actual_types AS (
    SELECT 
      t.typname,
      t.oid AS typid,
      t.typtype,
      CASE 
        WHEN t.typtype = 'e' THEN array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
        ELSE NULL
      END AS actual_labels
    FROM pg_type t
    LEFT JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typnamespace = 'public'::regnamespace
      AND t.typname IN ('UserRole', 'AssetStatus', 'RevisionStatus', 'FileRole', 'ReviewDecision', 'UsageAction', 'JobStatus')
    GROUP BY t.typname, t.oid, t.typtype
  ),
  incompatible_enums AS (
    SELECT 
      ee.typname,
      CASE 
        WHEN at.typtype != 'e' THEN 'NON_ENUM_TYPE'
        WHEN at.actual_labels IS DISTINCT FROM ee.expected_labels THEN 'LABEL_OR_ORDER_MISMATCH'
      END AS reason
    FROM expected_enums ee
    JOIN actual_types at ON at.typname = ee.typname
    WHERE at.typtype != 'e' OR at.actual_labels IS DISTINCT FROM ee.expected_labels
  ),
  expected_routines(proname, expected_sec, expected_owner, expected_rettype) AS (
    VALUES 
      ('resolve_storage_bucket', 'SECURITY INVOKER', 'sbloom_owner', 'text'),
      ('check_revision_review_linkage', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
      ('record_review_decision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
      ('submit_draft_revision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
      ('publish_asset_revision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
      ('allocate_next_revision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
      ('archive_asset', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
      ('unarchive_asset', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
      ('delete_draft_revision', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
      ('process_asset_revision_immutability', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
      ('process_asset_revision_delete', 'SECURITY INVOKER', 'sbloom_owner', 'trigger'),
      ('process_asset_file_immutability', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
      ('process_protect_asset_revision_counter', 'SECURITY INVOKER', 'sbloom_owner', 'trigger'),
      ('process_asset_revision_insert_defaults', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
      ('check_asset_published_consistency', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
      ('check_revision_published_consistency', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
      ('process_storage_deletion_job_transition', 'SECURITY DEFINER', 'sbloom_owner', 'trigger'),
      ('admin_purge_asset', 'SECURITY DEFINER', 'sbloom_owner', 'jsonb'),
      ('process_audit_events_immutable', 'SECURITY DEFINER', 'sbloom_owner', 'trigger')
  ),
  routine_conflicts AS (
    SELECT 
      er.proname,
      CASE 
        WHEN pg_get_function_result(p.oid) != er.expected_rettype THEN 'RETURN_TYPE_MISMATCH'
        WHEN (CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END) != er.expected_sec THEN 'SECURITY_MODE_MISMATCH'
        WHEN r.rolname != er.expected_owner THEN 'OWNER_MISMATCH'
        WHEN NOT (COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog, public, pg_temp']) THEN 'SEARCH_PATH_INSECURE'
        WHEN er.proname = 'admin_purge_asset' AND (
          (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app') AND has_function_privilege((SELECT oid FROM pg_roles WHERE rolname = 'sbloom_app'), p.oid, 'EXECUTE')) OR
          (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AND has_function_privilege((SELECT oid FROM pg_roles WHERE rolname = 'service_role'), p.oid, 'EXECUTE')) OR
          has_function_privilege('public', p.oid, 'EXECUTE')
        ) THEN 'UNSAFE_PURGE_EXECUTE_GRANT'
      END AS conflict_reason
    FROM expected_routines er
    JOIN pg_proc p ON p.proname = er.proname AND p.pronamespace = 'public'::regnamespace
    LEFT JOIN pg_roles r ON r.oid = p.proowner
    WHERE pg_get_function_result(p.oid) != er.expected_rettype
       OR (CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END) != er.expected_sec
       OR r.rolname != er.expected_owner
       OR NOT (COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog, public, pg_temp'])
       OR (er.proname = 'admin_purge_asset' AND (
            (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app') AND has_function_privilege((SELECT oid FROM pg_roles WHERE rolname = 'sbloom_app'), p.oid, 'EXECUTE')) OR
            (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AND has_function_privilege((SELECT oid FROM pg_roles WHERE rolname = 'service_role'), p.oid, 'EXECUTE')) OR
            has_function_privilege('public', p.oid, 'EXECUTE')
          ))
  ),
  existing_routines AS (
    SELECT p.proname 
    FROM pg_proc p 
    WHERE p.pronamespace = 'public'::regnamespace 
      AND p.proname IN (SELECT proname FROM expected_routines)
  ),
  auth_diagnostics AS (
    SELECT 
      (n.oid IS NOT NULL) AS auth_schema_exists,
      (c.oid IS NOT NULL) AS auth_table_exists,
      (n.oid IS NOT NULL AND has_schema_privilege(CURRENT_USER, n.oid, 'USAGE')) AS has_auth_usage,
      (c.oid IS NOT NULL AND has_table_privilege(CURRENT_USER, c.oid, 'SELECT')) AS has_users_select,
      (c.oid IS NOT NULL AND EXISTS (
        SELECT 1 
        FROM pg_attribute a 
        JOIN pg_type t ON t.oid = a.atttypid 
        WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped AND t.typname = 'uuid'
      )) AS has_valid_id_col
    FROM (SELECT 1) _
    LEFT JOIN pg_namespace n ON n.nspname = 'auth'
    LEFT JOIN pg_class c ON c.relname = 'users' AND c.relnamespace = n.oid
  ),
  creation_permissions AS (
    SELECT 
      has_schema_privilege(CURRENT_USER, 'public'::regnamespace, 'CREATE') AS has_public_create,
      has_schema_privilege(CURRENT_USER, 'public'::regnamespace, 'USAGE') AS has_public_usage,
      COALESCE((SELECT rolcreaterole OR rolsuper FROM pg_roles WHERE rolname = CURRENT_USER), false) AS can_manage_roles,
      COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = CURRENT_USER), false) AS is_superuser
  ),
  missing_supabase_roles AS (
    SELECT rname
    FROM (VALUES ('service_role')) AS v(rname)
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v.rname)
  ),
  missing_roles AS (
    SELECT rname
    FROM (VALUES ('sbloom_owner'), ('sbloom_admin'), ('sbloom_app')) AS v(rname)
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v.rname)
  ),
  ownership_transfer_readiness AS (
    SELECT 
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_owner') AS owner_exists,
      EXISTS (
        SELECT 1 FROM pg_roles r 
        WHERE r.rolname = 'sbloom_owner' 
          AND ((SELECT is_superuser FROM creation_permissions) OR pg_has_role(CURRENT_USER, r.oid, 'SET'))
      ) AS user_can_set_owner,
      EXISTS (
        SELECT 1 FROM pg_roles r 
        WHERE r.rolname = 'sbloom_owner' 
          AND has_schema_privilege(r.oid, 'public'::regnamespace, 'CREATE')
      ) AS owner_has_public_create
  ),
  grant_readiness AS (
    SELECT 
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app') AS app_exists,
      EXISTS (
        SELECT 1 FROM pg_roles r 
        WHERE r.rolname = 'sbloom_app' 
          AND ((SELECT is_superuser FROM creation_permissions) OR pg_has_role(CURRENT_USER, r.oid, 'MEMBER WITH ADMIN OPTION'))
      ) AS user_can_grant_app
  ),
  unsafe_role_access AS (
    -- service_role -> sbloom_admin / sbloom_owner
    SELECT cand.rolname || ' -> ' || target.rolname AS violation
    FROM pg_roles cand
    CROSS JOIN pg_roles target
    WHERE cand.rolname = 'service_role'
      AND target.rolname IN ('sbloom_admin', 'sbloom_owner')
      AND pg_has_role(cand.oid, target.oid, 'MEMBER')
    UNION ALL
    -- sbloom_app -> sbloom_admin / sbloom_owner (before grant to service_role)
    SELECT cand.rolname || ' -> ' || target.rolname AS violation
    FROM pg_roles cand
    CROSS JOIN pg_roles target
    WHERE cand.rolname = 'sbloom_app'
      AND target.rolname IN ('sbloom_admin', 'sbloom_owner')
      AND pg_has_role(cand.oid, target.oid, 'MEMBER')
    UNION ALL
    -- sbloom_admin -> sbloom_owner
    SELECT cand.rolname || ' -> ' || target.rolname AS violation
    FROM pg_roles cand
    CROSS JOIN pg_roles target
    WHERE cand.rolname = 'sbloom_admin'
      AND target.rolname = 'sbloom_owner'
      AND pg_has_role(cand.oid, target.oid, 'MEMBER')
    UNION ALL
    -- anon / authenticated -> any sbloom role
    SELECT cand.rolname || ' -> ' || target.rolname AS violation
    FROM pg_roles cand
    CROSS JOIN pg_roles target
    WHERE cand.rolname IN ('anon', 'authenticated')
      AND target.rolname IN ('sbloom_owner', 'sbloom_admin', 'sbloom_app')
      AND pg_has_role(cand.oid, target.oid, 'MEMBER')
    UNION ALL
    -- Non-login roles must NOT have LOGIN enabled
    SELECT rolname || ' (LOGIN enabled)' AS violation
    FROM pg_roles
    WHERE rolname IN ('sbloom_owner', 'sbloom_admin', 'sbloom_app')
      AND rolcanlogin = true
    UNION ALL
    -- sBLOOM roles must not possess elevated attributes
    SELECT rolname || ' (Elevated privileges: superuser/createrole/bypassrls)' AS violation
    FROM pg_roles
    WHERE rolname IN ('sbloom_owner', 'sbloom_admin', 'sbloom_app')
      AND (rolsuper = true OR rolcreaterole = true OR rolbypassrls = true)
  )
SELECT 
  (SELECT count(*) FROM existing_tables) AS existing_domain_tables_detected,
  (SELECT count(*) FROM legacy_tables) AS legacy_unprefixed_tables_detected,
  (SELECT count(*) FROM non_table_conflicts) AS conflicting_views_or_sequences,
  (SELECT count(*) FROM incompatible_enums) AS conflicting_enums_detected,
  (SELECT count(*) FROM routine_conflicts) AS conflicting_routines_detected,
  (SELECT count(*) FROM existing_routines) AS pre_existing_routines_detected,
  (SELECT count(*) FROM missing_roles) AS missing_intended_roles,
  (SELECT count(*) FROM unsafe_role_access) AS unsafe_role_violations_detected,
  CASE 
    -- ==========================================================================
    -- 1. FAILURES: Supabase Auth Dependency
    -- ==========================================================================
    WHEN (SELECT auth_schema_exists FROM auth_diagnostics) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Schema "auth" does not exist in database catalog.'
    WHEN (SELECT auth_table_exists FROM auth_diagnostics) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" was not found in catalog.'
    WHEN (SELECT has_auth_usage FROM auth_diagnostics) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Current user lacks USAGE privilege on schema "auth".'
    WHEN (SELECT has_users_select FROM auth_diagnostics) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Current user lacks SELECT privilege on Supabase Auth dependency "auth.users".'
    WHEN (SELECT has_valid_id_col FROM auth_diagnostics) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Supabase Auth dependency "auth.users" column "id" is missing or not of type UUID.'

    -- ==========================================================================
    -- 2. FAILURES: Current User Schema Creation Permissions
    -- ==========================================================================
    WHEN (SELECT has_public_create FROM creation_permissions) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Current user lacks CREATE privilege on schema "public".'
    WHEN (SELECT has_public_usage FROM creation_permissions) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Current user lacks USAGE privilege on schema "public".'

    -- ==========================================================================
    -- 3. FAILURES: Role Provisioning & Ownership-Transfer Prerequisites
    -- ==========================================================================
    WHEN (SELECT count(*) FROM missing_supabase_roles) > 0 THEN
      'PREFLIGHT_FAIL: Required Supabase role(s) not found in catalog: ' ||
      (SELECT string_agg(rname, ', ') FROM missing_supabase_roles) || '. Role "service_role" must exist prior to schema setup.'
    WHEN (SELECT count(*) FROM missing_roles) > 0 AND (SELECT can_manage_roles FROM creation_permissions) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Current user lacks CREATEROLE/SUPERUSER privilege to provision missing role(s): ' || 
      (SELECT string_agg(rname, ', ') FROM missing_roles) || '.'
    WHEN (SELECT owner_exists FROM ownership_transfer_readiness) AND (SELECT user_can_set_owner FROM ownership_transfer_readiness) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Role "sbloom_owner" already exists but current user lacks SET capability and cannot assign table/routine ownership.'
    WHEN (SELECT owner_exists FROM ownership_transfer_readiness) AND (SELECT owner_has_public_create FROM ownership_transfer_readiness) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Role "sbloom_owner" already exists but lacks CREATE privilege on schema "public" (required for ownership transfer).'
    WHEN (SELECT app_exists FROM grant_readiness) AND (SELECT user_can_grant_app FROM grant_readiness) IS NOT TRUE THEN
      'PREFLIGHT_FAIL: Role "sbloom_app" already exists but current user lacks ADMIN OPTION to grant it to "service_role".'

    -- ==========================================================================
    -- 4. FAILURES: Security Boundary & Attribute Violations
    -- ==========================================================================
    WHEN (SELECT count(*) FROM unsafe_role_access) > 0 THEN
      'PREFLIGHT_FAIL: Security violation detected: ' || (SELECT string_agg(violation, '; ') FROM unsafe_role_access) || '.'

    -- ==========================================================================
    -- 5. FAILURES: Non-Table Object Naming Collisions
    -- ==========================================================================
    WHEN (SELECT count(*) FROM non_table_conflicts) > 0 THEN
      'PREFLIGHT_FAIL: Conflicting non-table objects (views/sequences) detected with target names: ' ||
      (SELECT string_agg(relname, ', ') FROM non_table_conflicts) || '.'

    -- ==========================================================================
    -- 6. FAILURES: Enum Definition-Level Conflicts
    -- ==========================================================================
    WHEN (SELECT count(*) FROM incompatible_enums) > 0 THEN
      'PREFLIGHT_FAIL: Conflicting enum types detected: ' ||
      (SELECT string_agg(typname || ' (' || reason || ')', ', ') FROM incompatible_enums) || '.'

    -- ==========================================================================
    -- 7. FAILURES: Domain Table Partial Conflict (Preserve data policy)
    -- ==========================================================================
    WHEN (SELECT count(*) FROM existing_tables) > 0 AND (SELECT count(*) FROM existing_tables) < 11 THEN
      'PREFLIGHT_FAIL: Partial domain tables detected (' || (SELECT count(*) FROM existing_tables) || ' of 11: ' ||
      (SELECT string_agg(relname, ', ') FROM existing_tables) || '). STOP: inspect existing objects and dependencies, and preserve data. Do not automatically drop or recreate tables.'

    -- ==========================================================================
    -- 8. FAILURES: Existing Routine Definition & Privilege Conflicts
    -- ==========================================================================
    WHEN (SELECT count(*) FROM routine_conflicts) > 0 THEN
      'PREFLIGHT_FAIL: Conflicting routine(s) detected: ' ||
      (SELECT string_agg(proname || ' (' || conflict_reason || ')', ', ') FROM routine_conflicts) || '. Signature, security mode, search path, or execution grants mismatch canonical definitions.'

    -- ==========================================================================
    -- 9. NOTICES: Evaluated only when ALL failure conditions are clean
    -- ==========================================================================
    WHEN (SELECT count(*) FROM existing_tables) = 11 THEN
      'PREFLIGHT_NOTICE: All 11 domain tables already exist. Do not run 02_create_schema.sql. Run 03_verify_schema.sql to inspect status.'
    WHEN (SELECT count(*) FROM legacy_tables) > 0 THEN
      'PREFLIGHT_NOTICE: Legacy unprefixed tables detected in public (' || (SELECT count(*) FROM legacy_tables) || ' detected: ' ||
      (SELECT string_agg(relname, ', ') FROM legacy_tables) || '). STOP: inspect existing objects and dependencies, and preserve data. Do not automatically drop or recreate tables.'
    WHEN (SELECT count(*) FROM existing_routines) > 0 THEN
      'PREFLIGHT_NOTICE: Pre-existing routine(s) detected with target names (' || (SELECT count(*) FROM existing_routines) || ' of 19: ' ||
      (SELECT string_agg(proname, ', ') FROM existing_routines) || '). Manual review required: verify routine definitions against 02_create_schema.sql before proceeding.'

    -- ==========================================================================
    -- 10. PASS: All prerequisites verified, zero conflicts, zero notices
    -- ==========================================================================
    ELSE
      'PREFLIGHT_PASS: Environment is clean and all prerequisites are verified. Safe to proceed with 02_create_schema.sql.'
  END AS verdict;
