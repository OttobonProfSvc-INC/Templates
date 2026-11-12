-- ==============================================================================
-- Script 3: Comprehensive Schema Verification & Compliance Diagnostics
-- Target: Supabase Managed PostgreSQL
-- Suffix Standard: _templatedhub (11 domain tables)
-- Purpose: Read-only inventory verification of tables, columns, enums,
--          constraints, indexes, functions, triggers, RLS, and RBAC privileges.
-- Safety: 100% READ-ONLY. Never modifies, drops, or alters any data or objects.
-- Execution: Paste and run in Supabase Dashboard -> SQL Editor after 02_create_schema.sql.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXACT DOMAIN TABLES & OWNERSHIP INVENTORY (Target: 11 tables)
-- Validates that every expected table exists, is owned by sbloom_owner, and has RLS enabled.
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
    WHEN c.oid IS NULL THEN 'FAIL: Table Missing'
    WHEN r.rolname != 'sbloom_owner' THEN 'FAIL: Incorrect Owner (' || r.rolname || ')'
    WHEN c.relrowsecurity IS NOT TRUE THEN 'FAIL: RLS Not Enabled'
    ELSE 'PASS'
  END AS status,
  COALESCE(r.rolname, 'NONE') AS current_owner,
  COALESCE(c.relrowsecurity, false) AS rls_enabled
FROM expected_tables e
LEFT JOIN pg_class c ON c.relname = e.table_name AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_roles r ON r.oid = c.relowner
ORDER BY e.table_name;

-- ------------------------------------------------------------------------------
-- 2. EXACT ENUM TYPES & LABELS INVENTORY (Target: 7 enums)
-- Validates each expected enum and checks for exact label matching.
-- ------------------------------------------------------------------------------
WITH expected_enums(typname, expected_labels) AS (
  VALUES 
    ('UserRole', 'ADMIN, CONTRIBUTOR'),
    ('AssetStatus', 'DRAFT, PUBLISHED, ARCHIVED'),
    ('RevisionStatus', 'DRAFT, SUBMITTED, CHANGES_REQUESTED, APPROVED, PUBLISHED, SUPERSEDED, REJECTED'),
    ('FileRole', 'PRIMARY_ENTRY, SOURCE_ARCHIVE, THUMBNAIL, PREVIEW_IMAGE, ATTACHMENT'),
    ('ReviewDecision', 'APPROVED, CHANGES_REQUESTED, REJECTED'),
    ('UsageAction', 'VIEW, DOWNLOAD, PREVIEW, REMIX'),
    ('JobStatus', 'PENDING, PROCESSING, COMPLETED, FAILED')
),
actual_enums AS (
  SELECT 
    t.typname,
    string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS actual_labels
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  WHERE t.typnamespace = 'public'::regnamespace
    AND t.typname IN ('UserRole', 'AssetStatus', 'RevisionStatus', 'FileRole', 'ReviewDecision', 'UsageAction', 'JobStatus')
  GROUP BY t.typname
)
SELECT 
  ee.typname AS enum_name,
  CASE 
    WHEN ae.typname IS NULL THEN 'FAIL: Enum Missing'
    WHEN ae.actual_labels != ee.expected_labels THEN 'FAIL: Label Mismatch'
    ELSE 'PASS'
  END AS status,
  ee.expected_labels,
  COALESCE(ae.actual_labels, 'NONE') AS detected_labels
FROM expected_enums ee
LEFT JOIN actual_enums ae ON ae.typname = ee.typname
ORDER BY ee.typname;

-- ------------------------------------------------------------------------------
-- 3. DOMAIN TABLE COLUMNS & DATA TYPES AUDIT
-- Lists all columns across all 11 tables for precise inspection.
-- ------------------------------------------------------------------------------
SELECT 
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users_templatedhub', 'asset_types_templatedhub', 'assets_templatedhub',
    'asset_revisions_templatedhub', 'asset_files_templatedhub', 'reviews_templatedhub',
    'audit_events_templatedhub', 'collections_templatedhub', 'collection_assets_templatedhub',
    'asset_usages_templatedhub', 'storage_deletion_jobs_templatedhub'
  )
ORDER BY table_name, ordinal_position;

-- ------------------------------------------------------------------------------
-- 4. PRIMARY KEY CONSTRAINTS (Target: 11 Primary Keys)
-- ------------------------------------------------------------------------------
WITH expected_pks(table_name, constraint_name) AS (
  VALUES 
    ('users_templatedhub', 'users_templatedhub_pkey'),
    ('asset_types_templatedhub', 'asset_types_templatedhub_pkey'),
    ('assets_templatedhub', 'assets_templatedhub_pkey'),
    ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_pkey'),
    ('asset_files_templatedhub', 'asset_files_templatedhub_pkey'),
    ('reviews_templatedhub', 'reviews_templatedhub_pkey'),
    ('audit_events_templatedhub', 'audit_events_templatedhub_pkey'),
    ('collections_templatedhub', 'collections_templatedhub_pkey'),
    ('collection_assets_templatedhub', 'collection_assets_templatedhub_pkey'),
    ('asset_usages_templatedhub', 'asset_usages_templatedhub_pkey'),
    ('storage_deletion_jobs_templatedhub', 'storage_deletion_jobs_templatedhub_pkey')
)
SELECT 
  ep.table_name,
  ep.constraint_name,
  CASE WHEN con.oid IS NOT NULL THEN 'PASS' ELSE 'FAIL: Primary Key Missing' END AS status
FROM expected_pks ep
LEFT JOIN pg_constraint con ON con.conname = ep.constraint_name AND con.connamespace = 'public'::regnamespace
ORDER BY ep.table_name;

-- ------------------------------------------------------------------------------
-- 5. UNIQUE & COMPOSITE CONSTRAINTS / INDEXES INVENTORY
-- ------------------------------------------------------------------------------
WITH expected_uniques(table_name, index_name) AS (
  VALUES 
    ('users_templatedhub', 'users_templatedhub_email_key'),
    ('asset_types_templatedhub', 'asset_types_templatedhub_code_key'),
    ('assets_templatedhub', 'assets_templatedhub_slug_key'),
    ('assets_templatedhub', 'assets_templatedhub_legacy_id_key'),
    ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_deciding_review_id_key'),
    ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_asset_id_revision_number_key'),
    ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_id_asset_id_key'),
    ('collection_assets_templatedhub', 'collection_assets_templatedhub_collection_id_asset_id_key')
)
SELECT 
  eu.table_name,
  eu.index_name,
  CASE WHEN idx.indexrelid IS NOT NULL THEN 'PASS' ELSE 'FAIL: Unique Index Missing' END AS status
FROM expected_uniques eu
LEFT JOIN pg_stat_all_indexes idx ON idx.indexrelname = eu.index_name AND idx.schemaname = 'public'
ORDER BY eu.table_name, eu.index_name;

-- ------------------------------------------------------------------------------
-- ------------------------------------------------------------------------------
-- 6. FOREIGN KEY CONSTRAINTS INVENTORY (Target: 19 foreign keys)
-- Validates source table, constraint name, target table, and on-delete action.
-- ------------------------------------------------------------------------------
WITH expected_fks(source_table, constraint_name, target_table, delete_action) AS (
  VALUES 
    ('assets_templatedhub', 'assets_templatedhub_type_id_fkey', 'asset_types_templatedhub', 'r'),
    ('assets_templatedhub', 'assets_templatedhub_creator_id_fkey', 'users_templatedhub', 'r'),
    ('assets_templatedhub', 'assets_templatedhub_current_published_revision_id_id_fkey', 'asset_revisions_templatedhub', 'r'),
    ('assets_templatedhub', 'assets_templatedhub_remix_source_asset_id_fkey', 'assets_templatedhub', 'r'),
    ('assets_templatedhub', 'assets_templatedhub_remix_source_revision_id_remix_source__fkey', 'asset_revisions_templatedhub', 'r'),
    ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_asset_id_fkey', 'assets_templatedhub', 'c'),
    ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_created_by_id_fkey', 'users_templatedhub', 'r'),
    ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_deciding_review_id_fkey', 'reviews_templatedhub', 'r'),
    ('asset_files_templatedhub', 'asset_files_templatedhub_revision_id_fkey', 'asset_revisions_templatedhub', 'c'),
    ('reviews_templatedhub', 'reviews_templatedhub_asset_id_fkey', 'assets_templatedhub', 'r'),
    ('reviews_templatedhub', 'reviews_templatedhub_revision_id_asset_id_fkey', 'asset_revisions_templatedhub', 'r'),
    ('reviews_templatedhub', 'reviews_templatedhub_reviewer_id_fkey', 'users_templatedhub', 'r'),
    ('audit_events_templatedhub', 'audit_events_templatedhub_actor_id_fkey', 'users_templatedhub', 'n'),
    ('collections_templatedhub', 'collections_templatedhub_user_id_fkey', 'users_templatedhub', 'c'),
    ('collection_assets_templatedhub', 'collection_assets_templatedhub_collection_id_fkey', 'collections_templatedhub', 'c'),
    ('collection_assets_templatedhub', 'collection_assets_templatedhub_asset_id_fkey', 'assets_templatedhub', 'c'),
    ('asset_usages_templatedhub', 'asset_usages_templatedhub_asset_id_fkey', 'assets_templatedhub', 'r'),
    ('asset_usages_templatedhub', 'asset_usages_templatedhub_revision_id_asset_id_fkey', 'asset_revisions_templatedhub', 'r'),
    ('asset_usages_templatedhub', 'asset_usages_templatedhub_user_id_fkey', 'users_templatedhub', 'n')
)
SELECT 
  efk.source_table,
  efk.constraint_name,
  efk.target_table,
  efk.delete_action AS expected_delete_action,
  CASE 
    WHEN c.oid IS NULL THEN 'FAIL: FK Missing'
    WHEN src.relname IS NULL OR src.relname != efk.source_table THEN 'FAIL: Source Table Mismatch (' || COALESCE(src.relname, 'NONE') || ' vs ' || efk.source_table || ')'
    WHEN tgt.relname IS NULL OR tgt.relname != efk.target_table THEN 'FAIL: Target Table Mismatch (' || COALESCE(tgt.relname, 'NONE') || ' vs ' || efk.target_table || ')'
    WHEN c.confdeltype::text != efk.delete_action THEN 'FAIL: Action Mismatch (' || c.confdeltype::text || ' vs ' || efk.delete_action || ')'
    ELSE 'PASS'
  END AS status,
  COALESCE(src.relname, 'MISSING') AS detected_source_table,
  COALESCE(tgt.relname, 'MISSING') AS detected_target_table,
  COALESCE(c.confdeltype::text, 'MISSING') AS detected_delete_action
FROM expected_fks efk
LEFT JOIN pg_constraint c ON c.conname = efk.constraint_name AND c.connamespace = 'public'::regnamespace
LEFT JOIN pg_class src ON src.oid = c.conrelid
LEFT JOIN pg_class tgt ON tgt.oid = c.confrelid
ORDER BY efk.source_table, efk.constraint_name;

-- ------------------------------------------------------------------------------
-- 7. CHECK CONSTRAINTS INVENTORY
-- ------------------------------------------------------------------------------
SELECT 
  c.relname AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS constraint_definition,
  CASE 
    WHEN con.oid IS NOT NULL THEN 'PASS'
    ELSE 'FAIL'
  END AS status
FROM (VALUES ('assets_templatedhub', 'chk_asset_archive_consistency')) AS v(table_name, constraint_name)
LEFT JOIN pg_class c ON c.relname = v.table_name AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_constraint con ON con.conname = v.constraint_name AND con.conrelid = c.oid;

-- ------------------------------------------------------------------------------
-- 8. FUNCTIONS & PROCEDURES INVENTORY (Target: 19 routines)
-- Verifies owner (sbloom_owner), security attribute, and fixed search_path.
-- ------------------------------------------------------------------------------
WITH expected_routines(proname, expected_sec, expected_owner) AS (
  VALUES 
    ('resolve_storage_bucket', 'SECURITY INVOKER', 'sbloom_owner'),
    ('check_revision_review_linkage', 'SECURITY DEFINER', 'sbloom_owner'),
    ('record_review_decision', 'SECURITY DEFINER', 'sbloom_owner'),
    ('submit_draft_revision', 'SECURITY DEFINER', 'sbloom_owner'),
    ('publish_asset_revision', 'SECURITY DEFINER', 'sbloom_owner'),
    ('allocate_next_revision', 'SECURITY DEFINER', 'sbloom_owner'),
    ('archive_asset', 'SECURITY DEFINER', 'sbloom_owner'),
    ('unarchive_asset', 'SECURITY DEFINER', 'sbloom_owner'),
    ('delete_draft_revision', 'SECURITY DEFINER', 'sbloom_owner'),
    ('process_asset_revision_immutability', 'SECURITY DEFINER', 'sbloom_owner'),
    ('process_asset_revision_delete', 'SECURITY INVOKER', 'sbloom_owner'),
    ('process_asset_file_immutability', 'SECURITY DEFINER', 'sbloom_owner'),
    ('process_protect_asset_revision_counter', 'SECURITY INVOKER', 'sbloom_owner'),
    ('process_asset_revision_insert_defaults', 'SECURITY DEFINER', 'sbloom_owner'),
    ('check_asset_published_consistency', 'SECURITY DEFINER', 'sbloom_owner'),
    ('check_revision_published_consistency', 'SECURITY DEFINER', 'sbloom_owner'),
    ('process_storage_deletion_job_transition', 'SECURITY DEFINER', 'sbloom_owner'),
    ('admin_purge_asset', 'SECURITY DEFINER', 'sbloom_owner'),
    ('process_audit_events_immutable', 'SECURITY DEFINER', 'sbloom_owner')
)
SELECT 
  er.proname AS function_name,
  CASE 
    WHEN p.oid IS NULL THEN 'FAIL: Function Missing'
    WHEN r.rolname != er.expected_owner THEN 'FAIL: Owner Mismatch (' || r.rolname || ')'
    WHEN (CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END) != er.expected_sec THEN 'FAIL: Security Attribute Mismatch'
    WHEN NOT (p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']) THEN 'FAIL: Search Path Insecure'
    ELSE 'PASS'
  END AS status,
  COALESCE(r.rolname, 'NONE') AS owner,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_attribute,
  p.proconfig AS config_settings
FROM expected_routines er
LEFT JOIN pg_proc p ON p.proname = er.proname AND p.pronamespace = 'public'::regnamespace
LEFT JOIN pg_roles r ON r.oid = p.proowner
ORDER BY er.proname;

-- ------------------------------------------------------------------------------
-- 9. DATABASE TRIGGERS INVENTORY (Target: 10 triggers)
-- Verifies trigger existence, target table, trigger function, action timing, and enabled status.
-- ------------------------------------------------------------------------------
WITH expected_triggers(table_name, trigger_name, expected_func, expected_timing) AS (
  VALUES 
    ('asset_revisions_templatedhub', 'trg_verify_review_linkage', 'check_revision_review_linkage', 'AFTER'),
    ('asset_revisions_templatedhub', 'trg_asset_revision_immutability', 'process_asset_revision_immutability', 'BEFORE'),
    ('asset_revisions_templatedhub', 'trg_asset_revision_delete', 'process_asset_revision_delete', 'BEFORE'),
    ('asset_files_templatedhub', 'trg_asset_file_immutability', 'process_asset_file_immutability', 'BEFORE'),
    ('assets_templatedhub', 'trg_protect_asset_revision_counter', 'process_protect_asset_revision_counter', 'BEFORE'),
    ('asset_revisions_templatedhub', 'trg_asset_revision_insert_defaults', 'process_asset_revision_insert_defaults', 'BEFORE'),
    ('assets_templatedhub', 'trg_verify_asset_published_consistency', 'check_asset_published_consistency', 'AFTER'),
    ('asset_revisions_templatedhub', 'trg_verify_revision_published_consistency', 'check_revision_published_consistency', 'AFTER'),
    ('storage_deletion_jobs_templatedhub', 'trg_storage_deletion_job_transition', 'process_storage_deletion_job_transition', 'BEFORE'),
    ('audit_events_templatedhub', 'trg_audit_events_immutable', 'process_audit_events_immutable', 'BEFORE')
)
SELECT 
  et.table_name,
  et.trigger_name,
  et.expected_func,
  et.expected_timing,
  CASE 
    WHEN t.oid IS NULL THEN 'FAIL: Trigger Missing'
    WHEN c.oid IS NULL THEN 'FAIL: Table Missing'
    WHEN p.oid IS NULL THEN 'FAIL: Trigger Function Missing'
    WHEN p.proname != et.expected_func THEN 'FAIL: Function Mismatch (' || COALESCE(p.proname, 'NONE') || ' vs ' || et.expected_func || ')'
    WHEN (CASE WHEN (t.tgtype & 2) != 0 THEN 'BEFORE' ELSE 'AFTER' END) != et.expected_timing THEN 'FAIL: Timing Mismatch'
    WHEN t.tgenabled != 'O' THEN 'FAIL: Trigger Disabled'
    ELSE 'PASS'
  END AS status,
  COALESCE(t.tgenabled::text, 'MISSING') AS enabled_state,
  COALESCE(CASE WHEN (t.tgtype & 2) != 0 THEN 'BEFORE' ELSE 'AFTER' END, 'MISSING') AS actual_timing,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM expected_triggers et
JOIN pg_class c ON c.relname = et.table_name AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_trigger t ON t.tgrelid = c.oid AND t.tgname = et.trigger_name AND NOT t.tgisinternal
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
ORDER BY et.table_name, et.trigger_name;

-- ------------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) & POLICIES INVENTORY
-- Verifies RLS is active on all 11 tables and sbloom_app policy is defined.
-- ------------------------------------------------------------------------------
WITH expected_tables(table_name) AS (
  VALUES 
    ('users_templatedhub'), ('asset_types_templatedhub'), ('assets_templatedhub'),
    ('asset_revisions_templatedhub'), ('asset_files_templatedhub'), ('reviews_templatedhub'),
    ('audit_events_templatedhub'), ('collections_templatedhub'), ('collection_assets_templatedhub'),
    ('asset_usages_templatedhub'), ('storage_deletion_jobs_templatedhub')
)
SELECT 
  et.table_name,
  CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL: RLS Disabled' END AS rls_status,
  (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid = c.oid) AS total_policies_count,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid AND pol.polname = 'sbloom_app_all_policy') 
    THEN 'PASS: sbloom_app Scoped Policy Present'
    ELSE 'FAIL: Missing sbloom_app Policy'
  END AS sbloom_app_policy_status
FROM expected_tables et
JOIN pg_class c ON c.relname = et.table_name AND c.relnamespace = 'public'::regnamespace
ORDER BY et.table_name;

-- ------------------------------------------------------------------------------
-- 11. BROWSER CLIENT & SERVICE ROLE DIRECT TABLE PRIVILEGE AUDIT
-- Confirms that anon, authenticated, service_role, and PUBLIC have 0 direct table privileges.
-- service_role accesses domain tables exclusively through inherited sbloom_app role membership.
-- ------------------------------------------------------------------------------
SELECT 
  grantee,
  table_name,
  privilege_type,
  'FAIL: Unexpected Direct Privilege Granted to Role' AS alert
FROM information_schema.table_privileges 
WHERE table_schema = 'public'
  AND table_name IN (
    'users_templatedhub', 'asset_types_templatedhub', 'assets_templatedhub',
    'asset_revisions_templatedhub', 'asset_files_templatedhub', 'reviews_templatedhub',
    'audit_events_templatedhub', 'collections_templatedhub', 'collection_assets_templatedhub',
    'asset_usages_templatedhub', 'storage_deletion_jobs_templatedhub'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC');

-- ------------------------------------------------------------------------------
-- 12. RUNTIME LEAST-PRIVILEGE RESTRICTION AUDIT
-- Confirms asset_revisions_templatedhub has NO direct INSERT/DELETE for sbloom_app or service_role.
-- ------------------------------------------------------------------------------
SELECT 
  table_name,
  privilege_type,
  CASE 
    WHEN privilege_type IN ('INSERT', 'DELETE') THEN 'FAIL: Unauthorized Write Privilege'
    ELSE 'PASS'
  END AS privilege_check
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'asset_revisions_templatedhub'
  AND grantee IN ('sbloom_app', 'service_role');

-- ------------------------------------------------------------------------------
-- 13. DIRECT ROUTINE PRIVILEGES AUDIT (Target: 0 direct grants for service_role, anon, authenticated, PUBLIC)
-- Confirms that execute on all 19 routines is revoked from PUBLIC, anon, authenticated, and service_role.
-- ------------------------------------------------------------------------------
SELECT 
  grantee,
  routine_name,
  privilege_type,
  'FAIL: Unexpected Direct Routine Privilege Granted' AS alert
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'resolve_storage_bucket', 'check_revision_review_linkage', 'record_review_decision',
    'submit_draft_revision', 'publish_asset_revision', 'allocate_next_revision',
    'archive_asset', 'unarchive_asset', 'delete_draft_revision',
    'process_asset_revision_immutability', 'process_asset_revision_delete',
    'process_asset_file_immutability', 'process_protect_asset_revision_counter',
    'process_asset_revision_insert_defaults', 'check_asset_published_consistency',
    'check_revision_published_consistency', 'process_storage_deletion_job_transition',
    'admin_purge_asset', 'process_audit_events_immutable'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC');

-- ------------------------------------------------------------------------------
-- 14. ADMINISTRATIVE PURGE & TRIGGER PROCEDURES ISOLATION AUDIT
-- Confirms admin_purge_asset is revoked from sbloom_app, service_role, anon, authenticated.
-- ------------------------------------------------------------------------------
SELECT 
  p.proname,
  r.rolname AS grantee,
  'FAIL: Unauthorized Execution Privilege Granted' AS alert
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (
  SELECT 'sbloom_app' AS rolname UNION ALL
  SELECT 'service_role' UNION ALL
  SELECT 'anon' UNION ALL
  SELECT 'authenticated'
) r
WHERE n.nspname = 'public'
  AND p.proname = 'admin_purge_asset'
  AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');

-- ------------------------------------------------------------------------------
-- 15. UNIFIED COMPLIANCE SCORECARD
-- Exact itemized evaluation across all dimensions (No wildcard count inference).
-- ------------------------------------------------------------------------------
WITH 
  expected_tables(name) AS (
    VALUES ('users_templatedhub'), ('asset_types_templatedhub'), ('assets_templatedhub'),
           ('asset_revisions_templatedhub'), ('asset_files_templatedhub'), ('reviews_templatedhub'),
           ('audit_events_templatedhub'), ('collections_templatedhub'), ('collection_assets_templatedhub'),
           ('asset_usages_templatedhub'), ('storage_deletion_jobs_templatedhub')
  ),
  expected_enums(name) AS (
    VALUES ('UserRole'), ('AssetStatus'), ('RevisionStatus'), ('FileRole'), ('ReviewDecision'), ('UsageAction'), ('JobStatus')
  ),
  expected_fks(source_table, constraint_name, target_table, delete_action) AS (
    VALUES 
      ('assets_templatedhub', 'assets_templatedhub_type_id_fkey', 'asset_types_templatedhub', 'r'),
      ('assets_templatedhub', 'assets_templatedhub_creator_id_fkey', 'users_templatedhub', 'r'),
      ('assets_templatedhub', 'assets_templatedhub_current_published_revision_id_id_fkey', 'asset_revisions_templatedhub', 'r'),
      ('assets_templatedhub', 'assets_templatedhub_remix_source_asset_id_fkey', 'assets_templatedhub', 'r'),
      ('assets_templatedhub', 'assets_templatedhub_remix_source_revision_id_remix_source__fkey', 'asset_revisions_templatedhub', 'r'),
      ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_asset_id_fkey', 'assets_templatedhub', 'c'),
      ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_created_by_id_fkey', 'users_templatedhub', 'r'),
      ('asset_revisions_templatedhub', 'asset_revisions_templatedhub_deciding_review_id_fkey', 'reviews_templatedhub', 'r'),
      ('asset_files_templatedhub', 'asset_files_templatedhub_revision_id_fkey', 'asset_revisions_templatedhub', 'c'),
      ('reviews_templatedhub', 'reviews_templatedhub_asset_id_fkey', 'assets_templatedhub', 'r'),
      ('reviews_templatedhub', 'reviews_templatedhub_revision_id_asset_id_fkey', 'asset_revisions_templatedhub', 'r'),
      ('reviews_templatedhub', 'reviews_templatedhub_reviewer_id_fkey', 'users_templatedhub', 'r'),
      ('audit_events_templatedhub', 'audit_events_templatedhub_actor_id_fkey', 'users_templatedhub', 'n'),
      ('collections_templatedhub', 'collections_templatedhub_user_id_fkey', 'users_templatedhub', 'c'),
      ('collection_assets_templatedhub', 'collection_assets_templatedhub_collection_id_fkey', 'collections_templatedhub', 'c'),
      ('collection_assets_templatedhub', 'collection_assets_templatedhub_asset_id_fkey', 'assets_templatedhub', 'c'),
      ('asset_usages_templatedhub', 'asset_usages_templatedhub_asset_id_fkey', 'assets_templatedhub', 'r'),
      ('asset_usages_templatedhub', 'asset_usages_templatedhub_revision_id_asset_id_fkey', 'asset_revisions_templatedhub', 'r'),
      ('asset_usages_templatedhub', 'asset_usages_templatedhub_user_id_fkey', 'users_templatedhub', 'n')
  ),
  expected_routines(proname, expected_sec, expected_owner) AS (
    VALUES 
      ('resolve_storage_bucket', 'SECURITY INVOKER', 'sbloom_owner'),
      ('check_revision_review_linkage', 'SECURITY DEFINER', 'sbloom_owner'),
      ('record_review_decision', 'SECURITY DEFINER', 'sbloom_owner'),
      ('submit_draft_revision', 'SECURITY DEFINER', 'sbloom_owner'),
      ('publish_asset_revision', 'SECURITY DEFINER', 'sbloom_owner'),
      ('allocate_next_revision', 'SECURITY DEFINER', 'sbloom_owner'),
      ('archive_asset', 'SECURITY DEFINER', 'sbloom_owner'),
      ('unarchive_asset', 'SECURITY DEFINER', 'sbloom_owner'),
      ('delete_draft_revision', 'SECURITY DEFINER', 'sbloom_owner'),
      ('process_asset_revision_immutability', 'SECURITY DEFINER', 'sbloom_owner'),
      ('process_asset_revision_delete', 'SECURITY INVOKER', 'sbloom_owner'),
      ('process_asset_file_immutability', 'SECURITY DEFINER', 'sbloom_owner'),
      ('process_protect_asset_revision_counter', 'SECURITY INVOKER', 'sbloom_owner'),
      ('process_asset_revision_insert_defaults', 'SECURITY DEFINER', 'sbloom_owner'),
      ('check_asset_published_consistency', 'SECURITY DEFINER', 'sbloom_owner'),
      ('check_revision_published_consistency', 'SECURITY DEFINER', 'sbloom_owner'),
      ('process_storage_deletion_job_transition', 'SECURITY DEFINER', 'sbloom_owner'),
      ('admin_purge_asset', 'SECURITY DEFINER', 'sbloom_owner'),
      ('process_audit_events_immutable', 'SECURITY DEFINER', 'sbloom_owner')
  ),
  expected_trigs(table_name, trigger_name, expected_func, expected_timing) AS (
    VALUES 
      ('asset_revisions_templatedhub', 'trg_verify_review_linkage', 'check_revision_review_linkage', 'AFTER'),
      ('asset_revisions_templatedhub', 'trg_asset_revision_immutability', 'process_asset_revision_immutability', 'BEFORE'),
      ('asset_revisions_templatedhub', 'trg_asset_revision_delete', 'process_asset_revision_delete', 'BEFORE'),
      ('asset_files_templatedhub', 'trg_asset_file_immutability', 'process_asset_file_immutability', 'BEFORE'),
      ('assets_templatedhub', 'trg_protect_asset_revision_counter', 'process_protect_asset_revision_counter', 'BEFORE'),
      ('asset_revisions_templatedhub', 'trg_asset_revision_insert_defaults', 'process_asset_revision_insert_defaults', 'BEFORE'),
      ('assets_templatedhub', 'trg_verify_asset_published_consistency', 'check_asset_published_consistency', 'AFTER'),
      ('asset_revisions_templatedhub', 'trg_verify_revision_published_consistency', 'check_revision_published_consistency', 'AFTER'),
      ('storage_deletion_jobs_templatedhub', 'trg_storage_deletion_job_transition', 'process_storage_deletion_job_transition', 'BEFORE'),
      ('audit_events_templatedhub', 'trg_audit_events_immutable', 'process_audit_events_immutable', 'BEFORE')
  ),
  expected_trigger_funcs(name) AS (
    VALUES
      ('check_revision_review_linkage'), ('process_asset_revision_immutability'),
      ('process_asset_revision_delete'), ('process_asset_file_immutability'),
      ('process_protect_asset_revision_counter'), ('process_asset_revision_insert_defaults'),
      ('check_asset_published_consistency'), ('check_revision_published_consistency'),
      ('process_storage_deletion_job_transition'), ('process_audit_events_immutable')
  )
SELECT 
  '1. Domain Tables Inventory' AS verification_check,
  (SELECT count(*) FROM expected_tables et JOIN pg_class c ON c.relname = et.name AND c.relnamespace = 'public'::regnamespace) || ' / 11 tables present' AS result,
  CASE WHEN (SELECT count(*) FROM expected_tables et JOIN pg_class c ON c.relname = et.name AND c.relnamespace = 'public'::regnamespace) = 11 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '2. Table Ownership (sbloom_owner)' AS verification_check,
  (SELECT count(*) FROM expected_tables et JOIN pg_class c ON c.relname = et.name AND c.relnamespace = 'public'::regnamespace JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = 'sbloom_owner') || ' / 11 tables owned' AS result,
  CASE WHEN (SELECT count(*) FROM expected_tables et JOIN pg_class c ON c.relname = et.name AND c.relnamespace = 'public'::regnamespace JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = 'sbloom_owner') = 11 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '3. Domain Enum Types' AS verification_check,
  (SELECT count(*) FROM expected_enums ee JOIN pg_type t ON t.typname = ee.name AND t.typnamespace = 'public'::regnamespace) || ' / 7 enums present' AS result,
  CASE WHEN (SELECT count(*) FROM expected_enums ee JOIN pg_type t ON t.typname = ee.name AND t.typnamespace = 'public'::regnamespace) = 7 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '4. Foreign Key Constraints' AS verification_check,
  (SELECT count(*) FROM expected_fks efk 
    JOIN pg_constraint con ON con.conname = efk.constraint_name AND con.connamespace = 'public'::regnamespace
    JOIN pg_class src ON src.oid = con.conrelid AND src.relname = efk.source_table
    JOIN pg_class tgt ON tgt.oid = con.confrelid AND tgt.relname = efk.target_table
    WHERE con.confdeltype::text = efk.delete_action
  ) || ' / 19 FKs present' AS result,
  CASE WHEN (SELECT count(*) FROM expected_fks efk 
    JOIN pg_constraint con ON con.conname = efk.constraint_name AND con.connamespace = 'public'::regnamespace
    JOIN pg_class src ON src.oid = con.conrelid AND src.relname = efk.source_table
    JOIN pg_class tgt ON tgt.oid = con.confrelid AND tgt.relname = efk.target_table
    WHERE con.confdeltype::text = efk.delete_action
  ) = 19 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '5. Domain Check Constraints' AS verification_check,
  (SELECT count(*) FROM pg_constraint con WHERE con.conname = 'chk_asset_archive_consistency' AND con.connamespace = 'public'::regnamespace) || ' / 1 check constraint' AS result,
  CASE WHEN (SELECT count(*) FROM pg_constraint con WHERE con.conname = 'chk_asset_archive_consistency' AND con.connamespace = 'public'::regnamespace) = 1 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '6. Functions & Procedures' AS verification_check,
  (SELECT count(*) FROM expected_routines er 
    JOIN pg_proc p ON p.proname = er.proname AND p.pronamespace = 'public'::regnamespace 
    JOIN pg_roles r ON r.oid = p.proowner 
    WHERE r.rolname = er.expected_owner
      AND (CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END) = er.expected_sec
      AND (p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'])
  ) || ' / 19 routines verified' AS result,
  CASE WHEN (SELECT count(*) FROM expected_routines er 
    JOIN pg_proc p ON p.proname = er.proname AND p.pronamespace = 'public'::regnamespace 
    JOIN pg_roles r ON r.oid = p.proowner 
    WHERE r.rolname = er.expected_owner
      AND (CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END) = er.expected_sec
      AND (p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'])
  ) = 19 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '7. Database Triggers' AS verification_check,
  (SELECT count(*) FROM expected_trigs et 
    JOIN pg_class c ON c.relname = et.table_name AND c.relnamespace = 'public'::regnamespace
    JOIN pg_trigger t ON t.tgrelid = c.oid AND t.tgname = et.trigger_name AND t.tgenabled = 'O' AND NOT t.tgisinternal
    JOIN pg_proc p ON p.oid = t.tgfoid AND p.proname = et.expected_func
    WHERE (CASE WHEN (t.tgtype & 2) != 0 THEN 'BEFORE' ELSE 'AFTER' END) = et.expected_timing
  ) || ' / 10 triggers active' AS result,
  CASE WHEN (SELECT count(*) FROM expected_trigs et 
    JOIN pg_class c ON c.relname = et.table_name AND c.relnamespace = 'public'::regnamespace
    JOIN pg_trigger t ON t.tgrelid = c.oid AND t.tgname = et.trigger_name AND t.tgenabled = 'O' AND NOT t.tgisinternal
    JOIN pg_proc p ON p.oid = t.tgfoid AND p.proname = et.expected_func
    WHERE (CASE WHEN (t.tgtype & 2) != 0 THEN 'BEFORE' ELSE 'AFTER' END) = et.expected_timing
  ) = 10 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '8. Row Level Security (RLS)' AS verification_check,
  (SELECT count(*) FROM expected_tables et JOIN pg_class c ON c.relname = et.name AND c.relnamespace = 'public'::regnamespace WHERE c.relrowsecurity = true) || ' / 11 tables enabled' AS result,
  CASE WHEN (SELECT count(*) FROM expected_tables et JOIN pg_class c ON c.relname = et.name AND c.relnamespace = 'public'::regnamespace WHERE c.relrowsecurity = true) = 11 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '9. Table Direct Privilege Isolation' AS verification_check,
  (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name IN (SELECT name FROM expected_tables) AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')) || ' unexpected direct table grants' AS result,
  CASE WHEN (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name IN (SELECT name FROM expected_tables) AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')) = 0 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '10. Routine Direct Privilege Isolation' AS verification_check,
  (SELECT count(*) FROM information_schema.routine_privileges WHERE specific_schema = 'public' AND routine_name IN (SELECT proname FROM expected_routines) AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')) || ' unexpected direct routine grants' AS result,
  CASE WHEN (SELECT count(*) FROM information_schema.routine_privileges WHERE specific_schema = 'public' AND routine_name IN (SELECT proname FROM expected_routines) AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')) = 0 THEN 'PASS' ELSE 'FAIL' END AS status

UNION ALL

SELECT 
  '11. Administrative Purge Isolation' AS verification_check,
  CASE WHEN NOT has_function_privilege('sbloom_app', 'public.admin_purge_asset(uuid,uuid,text)', 'EXECUTE') 
        AND NOT has_function_privilege('service_role', 'public.admin_purge_asset(uuid,uuid,text)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.admin_purge_asset(uuid,uuid,text)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.admin_purge_asset(uuid,uuid,text)', 'EXECUTE')
       THEN 'Revoked from sbloom_app, service_role, anon, authenticated'
       ELSE 'Privileged leak detected'
  END AS result,
  CASE WHEN NOT has_function_privilege('sbloom_app', 'public.admin_purge_asset(uuid,uuid,text)', 'EXECUTE') 
        AND NOT has_function_privilege('service_role', 'public.admin_purge_asset(uuid,uuid,text)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.admin_purge_asset(uuid,uuid,text)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.admin_purge_asset(uuid,uuid,text)', 'EXECUTE')
       THEN 'PASS'
       ELSE 'FAIL'
  END AS status

UNION ALL

SELECT 
  '12. Trigger Routines Non-Execution' AS verification_check,
  (SELECT count(*) FROM expected_trigger_funcs etf 
    JOIN pg_proc p ON p.proname = etf.name AND p.pronamespace = 'public'::regnamespace
    CROSS JOIN (SELECT 'sbloom_app' AS r UNION ALL SELECT 'service_role' UNION ALL SELECT 'anon' UNION ALL SELECT 'authenticated') roles
    WHERE has_function_privilege(roles.r, p.oid, 'EXECUTE')) || ' unexpected trigger executions' AS result,
  CASE WHEN (SELECT count(*) FROM expected_trigger_funcs etf 
    JOIN pg_proc p ON p.proname = etf.name AND p.pronamespace = 'public'::regnamespace
    CROSS JOIN (SELECT 'sbloom_app' AS r UNION ALL SELECT 'service_role' UNION ALL SELECT 'anon' UNION ALL SELECT 'authenticated') roles
    WHERE has_function_privilege(roles.r, p.oid, 'EXECUTE')) = 0 THEN 'PASS' ELSE 'FAIL' END AS status;
