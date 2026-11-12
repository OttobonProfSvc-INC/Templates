-- ==============================================================================
-- sBLOOM Template & Content Hub — Customization Workflow RPC Migration Patch
-- Patch File: 05_add_customization_rpc_functions.sql
-- ==============================================================================
-- INSTRUCTIONS FOR DATABASE ADMINISTRATOR / OPERATOR:
-- 1. Review this SQL patch carefully.
-- 2. This file must be manually executed in the Supabase SQL Editor.
-- 3. Scope: Introduces two atomic SECURITY DEFINER routines:
--      - public.create_customization(...)
--      - public.save_customization_revision(...)
-- 4. Shared Supabase Golden Rule applies:
--      - Targets only explicitly named sBLOOM functions and sBLOOM roles.
--      - NO table modifications, NO DROP SCHEMA, NO CASCADE, NO broad privilege mutations.
--      - Direct table INSERT on asset_revisions_templatedhub remains strictly prohibited for sbloom_app.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Routine: public.create_customization (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
-- Atomically creates a customization container, validates base template status,
-- derives type_id directly from the source template, allocates revision #1 via
-- public.allocate_next_revision(), and logs REMIX telemetry in one transaction.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customization(
  p_customization_id UUID,
  p_slug TEXT,
  p_creator_id UUID,
  p_source_asset_id UUID,
  p_source_revision_id UUID,
  p_title TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_schema_version INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_creator_active boolean;
  v_source_type_id uuid;
  v_source_status "AssetStatus";
  v_source_remix_id uuid;
  v_curr_pub_rev_id uuid;
  v_rev_asset_id uuid;
  v_rev_status "RevisionStatus";
  v_now timestamptz;
  v_alloc_result jsonb;
  v_revision_id uuid;
  v_revision_number int;
  v_status text;
BEGIN
  -- 1. Validate creator with ordinary SELECT (no unnecessary lock on user row)
  SELECT is_active INTO v_creator_active
    FROM public.users_templatedhub
   WHERE id = p_creator_id;

  IF v_creator_active IS NULL OR v_creator_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Creator % does not exist or is inactive', p_creator_id;
  END IF;

  -- 2. Lock and validate source base template (Level 1: Container Lock FOR SHARE)
  SELECT type_id, status, remix_source_asset_id, current_published_revision_id
    INTO v_source_type_id, v_source_status, v_source_remix_id, v_curr_pub_rev_id
    FROM public.assets_templatedhub
   WHERE id = p_source_asset_id
     FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source template % does not exist', p_source_asset_id;
  END IF;

  IF v_source_remix_id IS NOT NULL THEN
    RAISE EXCEPTION 'Source asset % is a remix and cannot be used as a base template', p_source_asset_id;
  END IF;

  IF v_source_status != 'PUBLISHED'::"AssetStatus" THEN
    RAISE EXCEPTION 'Source template % is not published (current status: %)', p_source_asset_id, v_source_status;
  END IF;

  -- 3. Lock and validate source revision with distinguishable error semantics (Level 2: Revision Lock FOR SHARE)
  SELECT asset_id, status
    INTO v_rev_asset_id, v_rev_status
    FROM public.asset_revisions_templatedhub
   WHERE id = p_source_revision_id
     FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source revision % does not exist', p_source_revision_id;
  END IF;

  IF v_rev_asset_id != p_source_asset_id THEN
    RAISE EXCEPTION 'Source revision % does not belong to template %', p_source_revision_id, p_source_asset_id;
  END IF;

  IF v_rev_status != 'PUBLISHED'::"RevisionStatus" THEN
    RAISE EXCEPTION 'Source revision % is not in PUBLISHED status (current status: %)', p_source_revision_id, v_rev_status;
  END IF;

  IF v_curr_pub_rev_id IS NULL OR v_curr_pub_rev_id != p_source_revision_id THEN
    RAISE EXCEPTION 'Source revision % is not the current published revision of template %', p_source_revision_id, p_source_asset_id;
  END IF;

  -- 4. Insert target customization container asset (type_id derived authoritatively from source template)
  v_now := NOW();
  INSERT INTO public.assets_templatedhub (
    id,
    slug,
    type_id,
    creator_id,
    status,
    last_revision_number,
    current_published_revision_id,
    remix_source_asset_id,
    remix_source_revision_id,
    is_featured,
    created_at,
    updated_at
  ) VALUES (
    p_customization_id,
    p_slug,
    v_source_type_id,
    p_creator_id,
    'DRAFT'::"AssetStatus",
    0,
    NULL,
    p_source_asset_id,
    p_source_revision_id,
    FALSE,
    v_now,
    v_now
  );

  -- 5. Invoke authoritative public.allocate_next_revision() for revision #1
  v_alloc_result := public.allocate_next_revision(
    p_customization_id,
    p_title,
    NULL,
    p_metadata,
    p_schema_version,
    p_creator_id
  );

  v_revision_id := (v_alloc_result->>'revision_id')::UUID;
  v_revision_number := (v_alloc_result->>'revision_number')::INT;
  v_status := v_alloc_result->>'status';

  -- 6. Insert REMIX telemetry record on source base template
  INSERT INTO public.asset_usages_templatedhub (
    id,
    asset_id,
    revision_id,
    user_id,
    action,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_source_asset_id,
    p_source_revision_id,
    p_creator_id,
    'REMIX'::"UsageAction",
    v_now
  );

  -- 7. Return canonical JSONB result
  RETURN jsonb_build_object(
    'asset_id', p_customization_id,
    'slug', p_slug,
    'revision_id', v_revision_id,
    'revision_number', v_revision_number,
    'title', p_title,
    'status', v_status,
    'created_at', v_now,
    'updated_at', v_now
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Routine: public.save_customization_revision (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
-- Atomically validates customization container under lock, enforces strict OWNER-ONLY
-- authorization (zero admin bypass), validates actor active status, allocates
-- revision N+1 via public.allocate_next_revision(), and logs REMIX telemetry.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_customization_revision(
  p_asset_id UUID,
  p_actor_id UUID,
  p_title TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_schema_version INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_creator_id uuid;
  v_slug text;
  v_created_at timestamptz;
  v_remix_source_id uuid;
  v_actor_active boolean;
  v_alloc_result jsonb;
  v_revision_id uuid;
  v_revision_number int;
  v_status text;
  v_updated_at timestamptz;
BEGIN
  -- 1. Lock customization container asset (Level 1: Container Lock FOR UPDATE)
  SELECT creator_id, slug, created_at, remix_source_asset_id
    INTO v_creator_id, v_slug, v_created_at, v_remix_source_id
    FROM public.assets_templatedhub
   WHERE id = p_asset_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customization % does not exist', p_asset_id;
  END IF;

  IF v_remix_source_id IS NULL THEN
    RAISE EXCEPTION 'Asset % is not a customization (base templates cannot be edited via save_customization)', p_asset_id;
  END IF;

  IF v_creator_id != p_actor_id THEN
    RAISE EXCEPTION 'Access denied: User % is not the owner of customization %', p_actor_id, p_asset_id;
  END IF;

  -- 2. Validate actor active state with ordinary SELECT
  SELECT is_active INTO v_actor_active
    FROM public.users_templatedhub
   WHERE id = p_actor_id;

  IF v_actor_active IS NULL OR v_actor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Actor % does not exist or is inactive', p_actor_id;
  END IF;

  -- 3. Invoke authoritative public.allocate_next_revision() for revision N+1
  v_alloc_result := public.allocate_next_revision(
    p_asset_id,
    p_title,
    NULL,
    p_metadata,
    p_schema_version,
    p_actor_id
  );

  v_revision_id := (v_alloc_result->>'revision_id')::UUID;
  v_revision_number := (v_alloc_result->>'revision_number')::INT;
  v_status := v_alloc_result->>'status';

  -- 4. Re-read updated container timestamp
  SELECT updated_at INTO v_updated_at
    FROM public.assets_templatedhub
   WHERE id = p_asset_id;

  -- 5. Insert REMIX telemetry record on customization asset
  INSERT INTO public.asset_usages_templatedhub (
    id,
    asset_id,
    revision_id,
    user_id,
    action,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_asset_id,
    v_revision_id,
    p_actor_id,
    'REMIX'::"UsageAction",
    v_updated_at
  );

  -- 6. Return canonical JSONB result
  RETURN jsonb_build_object(
    'asset_id', p_asset_id,
    'slug', v_slug,
    'revision_id', v_revision_id,
    'revision_number', v_revision_number,
    'title', p_title,
    'status', v_status,
    'created_at', v_created_at,
    'updated_at', v_updated_at
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Ownership & Explicit Privilege Controls
-- ------------------------------------------------------------------------------
-- Assign routine ownership to sbloom_owner
ALTER FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) OWNER TO sbloom_owner;
ALTER FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) OWNER TO sbloom_owner;

-- Explicitly revoke execution from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) FROM anon;
    REVOKE ALL ON FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) FROM authenticated;
    REVOKE ALL ON FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) FROM authenticated;
  END IF;
END $$;

-- Grant execution strictly to sbloom_app (inherited by service_role via role membership)
GRANT EXECUTE ON FUNCTION public.create_customization(UUID, TEXT, UUID, UUID, UUID, TEXT, JSONB, INT) TO sbloom_app;
GRANT EXECUTE ON FUNCTION public.save_customization_revision(UUID, UUID, TEXT, JSONB, INT) TO sbloom_app;

-- ------------------------------------------------------------------------------
-- 4. PostgREST Schema Reload
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
