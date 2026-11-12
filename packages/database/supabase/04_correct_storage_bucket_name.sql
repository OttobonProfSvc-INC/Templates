-- ==============================================================================
-- sBLOOM Template & Content Hub — Storage Bucket Correction Patch
-- Patch File: 04_correct_storage_bucket_name.sql
-- ==============================================================================
-- INSTRUCTIONS FOR DATABASE ADMINISTRATOR / OPERATOR:
-- 1. This file must be manually executed in the Supabase SQL Editor.
-- 2. It is scoped strictly to correcting the canonical Storage bucket name:
--      Old: 'sBLOOM_templatedhub'  ->  New: 'sBLOOM_templateshub'
-- 3. All database tables, types, and schemas retain the '_templatedhub' namespace.
-- 4. No tables are truncated or dropped. No table-level locks or cascade drops occur.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Correct Default on Outbox Table (storage_deletion_jobs_templatedhub)
-- ------------------------------------------------------------------------------
ALTER TABLE public.storage_deletion_jobs_templatedhub
  ALTER COLUMN bucket_name SET DEFAULT 'sBLOOM_templateshub';

-- ------------------------------------------------------------------------------
-- 2. Update resolve_storage_bucket() with canonical bucket & allowlist
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_storage_bucket()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_override text;
  v_canonical_bucket constant text := 'sBLOOM_templateshub';
  v_allowed_buckets constant text[] := ARRAY[
    'sBLOOM_templateshub',
    'sBLOOM_templateshub-staging',
    'sBLOOM_templateshub-dev',
    'sBLOOM_templateshub-test',
    'sBLOOM_templateshub-isolated-test'
  ];
BEGIN
  v_override := current_setting('sbloom.storage_bucket', true);

  -- 1. If unset (NULL), return canonical production bucket
  IF v_override IS NULL THEN
    RETURN v_canonical_bucket;
  END IF;

  -- 2. Explicit handling of empty / blank bucket names
  v_override := trim(v_override);
  IF v_override = '' THEN
    RAISE EXCEPTION 'Invalid storage bucket configuration: bucket name cannot be empty';
  END IF;

  -- 3. Authoritative allowlist validation covering actual supported storage environments
  IF NOT (v_override = ANY(v_allowed_buckets)) THEN
    RAISE EXCEPTION 'Invalid storage bucket "%": bucket is not in the approved storage environment allowlist', v_override;
  END IF;

  -- 4. Role Authorization Boundary for Overrides:
  -- Untrusted runtime role sbloom_app is PROHIBITED from selecting noncanonical bucket destinations.
  -- Noncanonical bucket selection is strictly restricted to trusted administrative sessions.
  IF v_override <> v_canonical_bucket THEN
    IF NOT (SESSION_USER IN ('sbloom_owner', 'sbloom_admin', 'postgres')) THEN
      RAISE EXCEPTION 'Security violation: Database role % is not authorized to select noncanonical storage bucket "%"', SESSION_USER, v_override;
    END IF;
  END IF;

  RETURN v_override;
END;
$$;

-- Preserve routine ownership and security ACLs
ALTER FUNCTION public.resolve_storage_bucket() OWNER TO sbloom_owner;
GRANT EXECUTE ON FUNCTION public.resolve_storage_bucket() TO sbloom_app, sbloom_admin;
REVOKE ALL ON FUNCTION public.resolve_storage_bucket() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.resolve_storage_bucket() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.resolve_storage_bucket() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION public.resolve_storage_bucket() FROM service_role;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Immediate Post-Patch Self-Verification
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_resolved text;
  v_default_val text;
BEGIN
  -- Verify function resolves to sBLOOM_templateshub
  v_resolved := public.resolve_storage_bucket();
  IF v_resolved <> 'sBLOOM_templateshub' THEN
    RAISE EXCEPTION 'Verification failed: resolve_storage_bucket() returned "%", expected "sBLOOM_templateshub"', v_resolved;
  END IF;

  -- Verify table column default is updated
  SELECT column_default INTO v_default_val
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'storage_deletion_jobs_templatedhub'
     AND column_name = 'bucket_name';

  IF v_default_val NOT LIKE '%sBLOOM_templateshub%' THEN
    RAISE EXCEPTION 'Verification failed: column_default is "%", expected to contain "sBLOOM_templateshub"', v_default_val;
  END IF;

  RAISE NOTICE 'Patch 04_correct_storage_bucket_name applied and verified successfully.';
END $$;

COMMIT;

-- ==============================================================================
-- 4. READ-ONLY VERIFICATION QUERY (For manual operator review)
-- ==============================================================================
-- Existing rows are intentionally NOT modified automatically to preserve
-- audit history and avoid tripping the coordinate immutability trigger
-- (trg_storage_deletion_job_transition).
-- Run this query after applying the patch to inspect any existing jobs:
--
-- SELECT id, storage_key, bucket_name, status, attempts, created_at
--   FROM public.storage_deletion_jobs_templatedhub
--  WHERE bucket_name = 'sBLOOM_templatedhub';
-- ==============================================================================
