-- ==============================================================================
-- sBLOOM Template & Content Hub — Bootstrap & Master Ingestion RPC Migration Patch
-- Patch File: 07_add_bootstrap_and_ingestion_rpc.sql
-- ==============================================================================
-- INSTRUCTIONS FOR DATABASE ADMINISTRATOR / OPERATOR:
-- 1. Review this SQL patch carefully.
-- 2. This file must be manually executed in the Supabase SQL Editor by an authorized operator.
-- 3. Scope: Introduces three atomic, least-privilege SECURITY DEFINER routines:
--      - public.bootstrap_first_admin(p_email, p_name, p_dry_run)
--      - public.bootstrap_social_post_asset_type(p_dry_run)
--      - public.ingest_master_template(...)
-- 4. Shared Supabase Golden Rule applies:
--      - Targets only explicitly named sBLOOM functions and roles.
--      - NO table modifications, NO DROP SCHEMA, NO CASCADE, NO broad privilege mutations.
--      - Execution granted strictly to service_role (and sbloom_owner via ownership).
--      - Direct execution for PUBLIC, anon, authenticated, sbloom_app, and sbloom_admin is strictly REVOKED.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Routine: public.bootstrap_first_admin (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
-- Idempotently creates the first application ADMIN user.
-- Serializes execution via advisory transaction lock to prevent race conditions.
-- Rejects if multiple admins already exist or a conflicting non-admin user exists.
-- Returns ALREADY_EXISTS if the target admin is already present and active.
-- Rejects if matching admin exists but is deactivated (requires manual review).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(
  p_email TEXT,
  p_name TEXT,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_norm_email TEXT;
  v_norm_name TEXT;
  v_admin_count INT;
  v_existing_admin RECORD;
  v_matching_admin RECORD;
  v_existing_user RECORD;
  v_new_id UUID;
  v_now TIMESTAMP(3);
BEGIN
  -- 0. Serialize first-admin check and creation to prevent concurrent race conditions
  PERFORM pg_advisory_xact_lock(hashtext('sbloom_bootstrap_first_admin'));

  -- 1. Validate inputs
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RAISE EXCEPTION 'Admin email must be a non-empty string.';
  END IF;

  v_norm_email := LOWER(TRIM(p_email));
  IF LENGTH(v_norm_email) > 255 OR v_norm_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Invalid admin email format: "%". Must be a valid email address under 255 characters.', p_email;
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Admin name must be a non-empty string.';
  END IF;

  v_norm_name := TRIM(p_name);
  IF LENGTH(v_norm_name) < 1 OR LENGTH(v_norm_name) > 255 THEN
    RAISE EXCEPTION 'Admin name must be between 1 and 255 characters.';
  END IF;

  -- 2. Inspect existing admins in users_templatedhub
  SELECT COUNT(*) INTO v_admin_count
    FROM public.users_templatedhub
   WHERE role = 'ADMIN'::"UserRole";

  -- Scenario E: Multiple ADMIN users already exist in database
  IF v_admin_count > 1 THEN
    SELECT id, email, name, role, is_active, created_at, updated_at
      INTO v_matching_admin
      FROM public.users_templatedhub
     WHERE role = 'ADMIN'::"UserRole" AND LOWER(email) = v_norm_email
     LIMIT 1;

    IF v_matching_admin.id IS NOT NULL THEN
      IF v_matching_admin.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'ADMIN user with email "%" already exists but is deactivated (is_active=false). Reactivation requires administrative review.', v_norm_email;
      END IF;

      RETURN jsonb_build_object(
        'status', 'ALREADY_EXISTS',
        'dry_run', p_dry_run,
        'user', jsonb_build_object(
          'id', v_matching_admin.id,
          'email', v_matching_admin.email,
          'name', v_matching_admin.name,
          'role', v_matching_admin.role::text,
          'is_active', v_matching_admin.is_active,
          'created_at', v_matching_admin.created_at,
          'updated_at', v_matching_admin.updated_at
        ),
        'message', format('Admin user with email "%s" already exists and is active. (Note: Multiple admins exist in system).', v_norm_email)
      );
    END IF;

    RAISE EXCEPTION 'Multiple ADMIN users (%) already exist in the database. Bootstrap is no longer a first-admin operation.', v_admin_count;
  END IF;

  -- Scenario B & C: Exactly one ADMIN already exists
  IF v_admin_count = 1 THEN
    SELECT id, email, name, role, is_active, created_at, updated_at
      INTO v_existing_admin
      FROM public.users_templatedhub
     WHERE role = 'ADMIN'::"UserRole"
     LIMIT 1;

    IF LOWER(v_existing_admin.email) = v_norm_email THEN
      IF v_existing_admin.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'ADMIN user with email "%" already exists but is deactivated (is_active=false). Reactivation requires administrative review.', v_norm_email;
      END IF;

      RETURN jsonb_build_object(
        'status', 'ALREADY_EXISTS',
        'dry_run', p_dry_run,
        'user', jsonb_build_object(
          'id', v_existing_admin.id,
          'email', v_existing_admin.email,
          'name', v_existing_admin.name,
          'role', v_existing_admin.role::text,
          'is_active', v_existing_admin.is_active,
          'created_at', v_existing_admin.created_at,
          'updated_at', v_existing_admin.updated_at
        ),
        'message', format('Admin user with email "%s" already exists (id: %s). No changes needed.', v_norm_email, v_existing_admin.id)
      );
    END IF;

    RAISE EXCEPTION 'An ADMIN user already exists in the database with email "%". First-admin bootstrap cannot create an additional admin with a different email.', v_existing_admin.email;
  END IF;

  -- Scenario D: No ADMIN exists, but email is already registered to a non-ADMIN user
  SELECT id, email, name, role, is_active
    INTO v_existing_user
    FROM public.users_templatedhub
   WHERE LOWER(email) = v_norm_email
   LIMIT 1;

  IF v_existing_user.id IS NOT NULL THEN
    RAISE EXCEPTION 'Email "%" is already registered to an existing user with role "%". Cannot silently change an existing user''s role.', v_norm_email, v_existing_user.role;
  END IF;

  -- Scenario A: Zero ADMINs exist and email is available
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'status', 'WOULD_CREATE',
      'dry_run', true,
      'user', jsonb_build_object(
        'email', v_norm_email,
        'name', v_norm_name,
        'role', 'ADMIN',
        'is_active', true
      ),
      'message', format('DRY-RUN: First ADMIN user would be created for "%s" <%s> with role ADMIN and is_active=true. (0 database writes performed).', v_norm_name, v_norm_email)
    );
  END IF;

  -- Execute live creation with clock_timestamp
  v_new_id := gen_random_uuid();
  v_now := clock_timestamp();

  INSERT INTO public.users_templatedhub (
    id, email, name, role, is_active, created_at, updated_at
  ) VALUES (
    v_new_id, v_norm_email, v_norm_name, 'ADMIN'::"UserRole", true, v_now, v_now
  );

  RETURN jsonb_build_object(
    'status', 'CREATED',
    'dry_run', false,
    'user', jsonb_build_object(
      'id', v_new_id,
      'email', v_norm_email,
      'name', v_norm_name,
      'role', 'ADMIN',
      'is_active', true,
      'created_at', v_now,
      'updated_at', v_now
    ),
    'message', format('First ADMIN user successfully created for "%s" <%s> with id: %s.', v_norm_name, v_norm_email, v_new_id)
  );
END;
$$;


-- ------------------------------------------------------------------------------
-- 2. Routine: public.bootstrap_social_post_asset_type (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
-- Idempotently creates canonical "social-post" AssetType if missing.
-- Canonical schema attributes:
--   description = NULL, icon = NULL, metadata_schema = '{}',
--   file_rules = NULL, schema_version = 1, is_active = true.
-- Returns ALREADY_EXISTS if present and active.
-- Rejects with conflict if present but deactivated.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_social_post_asset_type(
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_code CONSTANT VARCHAR(50) := 'social-post';
  v_name CONSTANT VARCHAR(100) := 'Social Post';
  v_existing RECORD;
  v_new_id UUID;
  v_now TIMESTAMP(3);
BEGIN
  -- 1. Inspect existing asset type record
  SELECT id, code, name, description, icon, metadata_schema, file_rules, schema_version, is_active, created_at, updated_at
    INTO v_existing
    FROM public.asset_types_templatedhub
   WHERE code = v_code;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.is_active IS TRUE THEN
      RETURN jsonb_build_object(
        'status', 'ALREADY_EXISTS',
        'dry_run', p_dry_run,
        'asset_type', jsonb_build_object(
          'id', v_existing.id,
          'code', v_existing.code,
          'name', v_existing.name,
          'description', v_existing.description,
          'icon', v_existing.icon,
          'metadata_schema', v_existing.metadata_schema,
          'file_rules', v_existing.file_rules,
          'schema_version', v_existing.schema_version,
          'is_active', v_existing.is_active,
          'created_at', v_existing.created_at,
          'updated_at', v_existing.updated_at
        ),
        'message', format('AssetType "%s" already exists and is active (id: %s). No changes needed.', v_code, v_existing.id)
      );
    ELSE
      RAISE EXCEPTION 'AssetType "%" exists but is deactivated (is_active=false). Reactivation requires administrative review.', v_code;
    END IF;
  END IF;

  -- 2. If dry_run, return WOULD_CREATE payload
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'status', 'WOULD_CREATE',
      'dry_run', true,
      'asset_type', jsonb_build_object(
        'code', v_code,
        'name', v_name,
        'description', NULL,
        'icon', NULL,
        'metadata_schema', '{}'::jsonb,
        'file_rules', NULL,
        'schema_version', 1,
        'is_active', true
      ),
      'message', format('DRY-RUN: AssetType "%s" would be created with is_active=true. (0 database writes performed).', v_code)
    );
  END IF;

  -- 3. Execute live insert with canonical schema values
  v_new_id := gen_random_uuid();
  v_now := clock_timestamp();

  INSERT INTO public.asset_types_templatedhub (
    id,
    code,
    name,
    description,
    icon,
    metadata_schema,
    file_rules,
    schema_version,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    v_new_id,
    v_code,
    v_name,
    NULL,
    NULL,
    '{}'::jsonb,
    NULL,
    1,
    true,
    v_now,
    v_now
  );

  RETURN jsonb_build_object(
    'status', 'CREATED',
    'dry_run', false,
    'asset_type', jsonb_build_object(
      'id', v_new_id,
      'code', v_code,
      'name', v_name,
      'description', NULL,
      'icon', NULL,
      'metadata_schema', '{}'::jsonb,
      'file_rules', NULL,
      'schema_version', 1,
      'is_active', true,
      'created_at', v_now,
      'updated_at', v_now
    ),
    'message', format('AssetType "%s" successfully created with id: %s.', v_code, v_new_id)
  );
END;
$$;


-- ------------------------------------------------------------------------------
-- 3. Routine: public.ingest_master_template (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
-- Atomically ingests one master template into the database:
--   1. Validates actor is an active ADMIN in users_templatedhub.
--   2. Validates asset_type exists and is active.
--   3. Enforces master template invariant: remix_source_asset_id is NULL.
--   4. Enforces strict input validation: checksum_sha256 (64 hex), size_bytes > 0.
--   5. Checks explicit storage_key collision:
--        - Identical deterministic rerun -> ALREADY_INGESTED.
--        - Storage key bound to differing asset/content -> raises Conflict.
--   6. Checks container asset collision/idempotency via Asset -> Revision #1 -> AssetFile.
--   7. Inserts container Asset (status: DRAFT, last_revision_number: 0).
--   8. Allocates Revision #1 via authoritative public.allocate_next_revision().
--   9. Inserts primary AssetFile using actual schema:
--        (id, revision_id, storage_key, file_name, mime_type, size_bytes,
--         checksum_sha256, role, is_entry_point, created_at).
--   10. Inserts AuditEvent record ('INGEST_MASTER_TEMPLATE', entity_type 'Asset').
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_master_template(
  p_asset_id UUID,
  p_slug TEXT,
  p_legacy_id TEXT DEFAULT NULL,
  p_import_source TEXT DEFAULT 'template-library/social-media',
  p_asset_type_code TEXT DEFAULT 'social-post',
  p_is_featured BOOLEAN DEFAULT false,
  p_actor_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_schema_version INT DEFAULT 1,
  p_file_id UUID DEFAULT NULL,
  p_storage_key TEXT DEFAULT NULL,
  p_file_name TEXT DEFAULT NULL,
  p_mime_type TEXT DEFAULT 'image/jpeg',
  p_size_bytes BIGINT DEFAULT 0,
  p_checksum_sha256 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_norm_sha TEXT;
  v_actor_role TEXT;
  v_actor_active BOOLEAN;
  v_type_id UUID;
  v_type_active BOOLEAN;
  v_key_file RECORD;
  v_existing_asset RECORD;
  v_existing_primary_file RECORD;
  v_now TIMESTAMP(3);
  v_alloc_result JSONB;
  v_revision_id UUID;
  v_revision_number INT;
  v_file_id UUID;
BEGIN
  -- 1. Input Validations
  IF p_asset_id IS NULL THEN
    RAISE EXCEPTION 'asset_id UUID is required.';
  END IF;

  IF p_slug IS NULL OR TRIM(p_slug) = '' THEN
    RAISE EXCEPTION 'slug must be a non-empty string.';
  END IF;

  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id UUID is required.';
  END IF;

  IF p_storage_key IS NULL OR TRIM(p_storage_key) = '' THEN
    RAISE EXCEPTION 'storage_key must be a non-empty string.';
  END IF;

  IF p_file_name IS NULL OR TRIM(p_file_name) = '' THEN
    RAISE EXCEPTION 'file_name must be a non-empty string.';
  END IF;

  -- Item 3: Require checksum_sha256: non-null/non-empty and exactly 64 hexadecimal characters
  IF p_checksum_sha256 IS NULL OR TRIM(p_checksum_sha256) = '' THEN
    RAISE EXCEPTION 'checksum_sha256 is required and cannot be empty.';
  END IF;

  v_norm_sha := LOWER(TRIM(p_checksum_sha256));
  IF v_norm_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid checksum_sha256: "%". Must be exactly 64 hexadecimal characters.', p_checksum_sha256;
  END IF;

  -- Item 3: Require p_size_bytes > 0
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'size_bytes must be a positive integer greater than 0.';
  END IF;

  -- 2. Validate actor is an active ADMIN
  SELECT role::text, is_active
    INTO v_actor_role, v_actor_active
    FROM public.users_templatedhub
   WHERE id = p_actor_id;

  IF v_actor_role IS NULL OR v_actor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Actor % does not exist or is inactive.', p_actor_id;
  END IF;

  IF v_actor_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Forbidden: Actor % has role "%" but master template ingestion requires ADMIN role.', p_actor_id, v_actor_role;
  END IF;

  -- 3. Validate AssetType exists and is active
  SELECT id, is_active
    INTO v_type_id, v_type_active
    FROM public.asset_types_templatedhub
   WHERE code = TRIM(p_asset_type_code);

  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'AssetType with code "%" does not exist. Run asset-type bootstrap first.', p_asset_type_code;
  END IF;

  IF v_type_active IS NOT TRUE THEN
    RAISE EXCEPTION 'AssetType "%" is inactive. Cannot ingest templates under inactive type.', p_asset_type_code;
  END IF;

  -- 4. Item 4: Explicit storage_key Collision & Idempotency Protection
  SELECT f.id, f.revision_id, f.storage_key, f.checksum_sha256, r.asset_id, a.slug
    INTO v_key_file
    FROM public.asset_files_templatedhub f
    JOIN public.asset_revisions_templatedhub r ON r.id = f.revision_id
    JOIN public.assets_templatedhub a ON a.id = r.asset_id
   WHERE f.storage_key = TRIM(p_storage_key)
   LIMIT 1;

  IF v_key_file.id IS NOT NULL THEN
    -- Identical deterministic rerun may return ALREADY_INGESTED
    IF v_key_file.asset_id = p_asset_id 
       AND v_key_file.slug = TRIM(p_slug) 
       AND LOWER(v_key_file.checksum_sha256) = v_norm_sha THEN
      RETURN jsonb_build_object(
        'status', 'ALREADY_INGESTED',
        'asset_id', v_key_file.asset_id,
        'revision_id', v_key_file.revision_id,
        'file_id', v_key_file.id,
        'slug', v_key_file.slug,
        'storage_key', v_key_file.storage_key,
        'message', format('Master template "%s" already ingested with matching storage key and checksum.', v_key_file.slug)
      );
    ELSE
      -- Same storage_key belonging to different asset/content must raise Conflict
      RAISE EXCEPTION 'Asset collision: Storage key "%" is already bound to asset % ("%") with differing content or identity.',
        TRIM(p_storage_key), v_key_file.asset_id, v_key_file.slug;
    END IF;
  END IF;

  -- 5. Asset Container Existence & Idempotency / Collision Check
  SELECT a.id, a.slug, a.legacy_id, a.status, a.last_revision_number, a.remix_source_asset_id
    INTO v_existing_asset
    FROM public.assets_templatedhub a
   WHERE a.id = p_asset_id
      OR a.slug = TRIM(p_slug)
      OR (p_legacy_id IS NOT NULL AND a.legacy_id = TRIM(p_legacy_id))
   LIMIT 1;

  IF v_existing_asset.id IS NOT NULL THEN
    -- Item 2: Primary file lookup must join Asset -> Revision #1 -> AssetFile and require role='PRIMARY_ENTRY' and is_entry_point=true
    SELECT f.id, f.revision_id, f.storage_key, f.checksum_sha256
      INTO v_existing_primary_file
      FROM public.asset_revisions_templatedhub r
      JOIN public.asset_files_templatedhub f ON f.revision_id = r.id
     WHERE r.asset_id = v_existing_asset.id
       AND r.revision_number = 1
       AND f.role = 'PRIMARY_ENTRY'::"FileRole"
       AND f.is_entry_point = true
     LIMIT 1;

    IF v_existing_primary_file.id IS NOT NULL
       AND v_existing_primary_file.storage_key = TRIM(p_storage_key)
       AND LOWER(v_existing_primary_file.checksum_sha256) = v_norm_sha THEN
      RETURN jsonb_build_object(
        'status', 'ALREADY_INGESTED',
        'asset_id', v_existing_asset.id,
        'revision_id', v_existing_primary_file.revision_id,
        'file_id', v_existing_primary_file.id,
        'slug', v_existing_asset.slug,
        'storage_key', v_existing_primary_file.storage_key,
        'message', format('Master template "%s" already ingested with matching storage key and checksum.', v_existing_asset.slug)
      );
    ELSE
      RAISE EXCEPTION 'Asset collision: An asset already exists with matching id, slug, or legacy_id but differing attributes (existing id: %, slug: %)',
        v_existing_asset.id, v_existing_asset.slug;
    END IF;
  END IF;

  -- 6. Insert Master Asset Container (Master Template Invariants: remix fields strictly NULL)
  v_now := clock_timestamp();

  INSERT INTO public.assets_templatedhub (
    id,
    slug,
    legacy_id,
    import_source,
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
    p_asset_id,
    TRIM(p_slug),
    CASE WHEN p_legacy_id IS NOT NULL THEN TRIM(p_legacy_id) ELSE NULL END,
    CASE WHEN p_import_source IS NOT NULL THEN TRIM(p_import_source) ELSE 'template-library/social-media' END,
    v_type_id,
    p_actor_id,
    'DRAFT'::"AssetStatus",
    0,
    NULL,
    NULL,
    NULL,
    COALESCE(p_is_featured, false),
    v_now,
    v_now
  );

  -- 7. Allocate Revision #1 via authoritative public.allocate_next_revision
  v_alloc_result := public.allocate_next_revision(
    p_asset_id,
    TRIM(p_title),
    p_description,
    COALESCE(p_metadata, '{}'::jsonb),
    COALESCE(p_schema_version, 1),
    p_actor_id
  );

  v_revision_id := (v_alloc_result->>'revision_id')::UUID;
  v_revision_number := (v_alloc_result->>'revision_number')::INT;

  IF v_revision_id IS NULL THEN
    RAISE EXCEPTION 'Internal error: Failed to allocate revision #1 via public.allocate_next_revision()';
  END IF;

  -- 8. Item 2: Insert into ACTUAL asset_files_templatedhub schema
  -- Columns: id, revision_id, storage_key, file_name, mime_type, size_bytes, checksum_sha256, role, is_entry_point, created_at
  -- Nonexistent columns removed: asset_id, file_role, is_ready
  v_file_id := COALESCE(p_file_id, gen_random_uuid());

  INSERT INTO public.asset_files_templatedhub (
    id,
    revision_id,
    storage_key,
    file_name,
    mime_type,
    size_bytes,
    checksum_sha256,
    role,
    is_entry_point,
    created_at
  ) VALUES (
    v_file_id,
    v_revision_id,
    TRIM(p_storage_key),
    TRIM(p_file_name),
    COALESCE(TRIM(p_mime_type), 'image/jpeg'),
    p_size_bytes,
    v_norm_sha,
    'PRIMARY_ENTRY'::"FileRole",
    true,
    v_now
  );

  -- 9. Record Immutable Audit Event
  INSERT INTO public.audit_events_templatedhub (
    id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_actor_id,
    'INGEST_MASTER_TEMPLATE',
    'Asset',
    p_asset_id,
    jsonb_build_object(
      'slug', TRIM(p_slug),
      'type_code', TRIM(p_asset_type_code),
      'storage_key', TRIM(p_storage_key),
      'checksum_sha256', v_norm_sha,
      'revision_id', v_revision_id,
      'file_id', v_file_id,
      'revision_number', v_revision_number
    ),
    v_now
  );

  -- 10. Return Canonical Ingestion Result
  RETURN jsonb_build_object(
    'status', 'CREATED',
    'asset_id', p_asset_id,
    'revision_id', v_revision_id,
    'file_id', v_file_id,
    'revision_number', v_revision_number,
    'slug', TRIM(p_slug),
    'storage_key', TRIM(p_storage_key),
    'message', format('Master template "%s" successfully ingested with revision #%s.', TRIM(p_slug), v_revision_number)
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Ownership & Explicit Privilege Controls
-- ------------------------------------------------------------------------------
-- Assign routine ownership to sbloom_owner (ownership provides execution authority; no direct ACL required)
ALTER FUNCTION public.bootstrap_first_admin(TEXT, TEXT, BOOLEAN) OWNER TO sbloom_owner;
ALTER FUNCTION public.bootstrap_social_post_asset_type(BOOLEAN) OWNER TO sbloom_owner;
ALTER FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) OWNER TO sbloom_owner;

-- Explicitly revoke execution from PUBLIC, anon, authenticated, sbloom_app, and sbloom_admin
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_social_post_asset_type(BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT, TEXT, BOOLEAN) FROM anon;
    REVOKE ALL ON FUNCTION public.bootstrap_social_post_asset_type(BOOLEAN) FROM anon;
    REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT, TEXT, BOOLEAN) FROM authenticated;
    REVOKE ALL ON FUNCTION public.bootstrap_social_post_asset_type(BOOLEAN) FROM authenticated;
    REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app') THEN
    REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT, TEXT, BOOLEAN) FROM sbloom_app;
    REVOKE ALL ON FUNCTION public.bootstrap_social_post_asset_type(BOOLEAN) FROM sbloom_app;
    REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM sbloom_app;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_admin') THEN
    REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT, TEXT, BOOLEAN) FROM sbloom_admin;
    REVOKE ALL ON FUNCTION public.bootstrap_social_post_asset_type(BOOLEAN) FROM sbloom_admin;
    REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM sbloom_admin;
  END IF;
END $$;

-- Grant direct EXECUTE strictly to service_role
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(TEXT, TEXT, BOOLEAN) TO service_role;
    GRANT EXECUTE ON FUNCTION public.bootstrap_social_post_asset_type(BOOLEAN) TO service_role;
    GRANT EXECUTE ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. PostgREST Schema Reload
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
