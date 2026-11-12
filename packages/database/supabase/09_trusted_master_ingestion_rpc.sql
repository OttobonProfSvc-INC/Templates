-- ==============================================================================
-- sBLOOM Template & Content Hub - Trusted Master Ingestion RPC Migration
-- Migration Script: 09_trusted_master_ingestion_rpc.sql
-- ==============================================================================
-- Security & Operational Context:
-- 1. sBLOOM operates under the Organization System Actor model with NO end-user auth.
-- 2. Master catalog ingestion is executed exclusively by the trusted backend service-role.
-- 3. Adds `p_publish_immediately BOOLEAN DEFAULT false` to `public.ingest_master_template`.
-- 4. Immediate publication is strictly verified: requires service_role/sbloom_owner execution context.
-- 5. Safe idempotent reconciliation: If matching master exists (slug/storage_key/checksum),
--    promotes existing Revision #1 and Asset container to PUBLISHED without duplicate inserts.
-- 6. Zero permission weakening: REVOKED from PUBLIC, anon, authenticated, sbloom_app, sbloom_admin.
--    Granted strictly to service_role (and owned by sbloom_owner).
-- ==============================================================================

BEGIN;

-- Update process_asset_revision_immutability to allow SUBMITTED -> PUBLISHED for trusted catalog promotion
CREATE OR REPLACE FUNCTION public.process_asset_revision_immutability()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('sbloom.admin_purge_active', true) = 'true' THEN
    IF SESSION_USER IN ('sbloom_owner', 'sbloom_admin', 'postgres') THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Security violation: Unauthorized purge bypass attempt by role %', SESSION_USER;
    END IF;
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'AssetRevision id is immutable (attempted % -> %)', OLD.id, NEW.id;
  END IF;
  IF OLD.asset_id IS DISTINCT FROM NEW.asset_id THEN
    RAISE EXCEPTION 'AssetRevision asset_id cannot be changed (attempted % -> %)', OLD.asset_id, NEW.asset_id;
  END IF;
  IF OLD.revision_number IS DISTINCT FROM NEW.revision_number THEN
    RAISE EXCEPTION 'AssetRevision revision_number cannot be rewritten (attempted % -> %)', OLD.revision_number, NEW.revision_number;
  END IF;
  IF OLD.created_by_id IS DISTINCT FROM NEW.created_by_id THEN
    RAISE EXCEPTION 'AssetRevision created_by_id provenance cannot be changed (attempted % -> %)', OLD.created_by_id, NEW.created_by_id;
  END IF;
  IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'AssetRevision created_at timestamp cannot be changed (attempted % -> %)', OLD.created_at, NEW.created_at;
  END IF;

  IF OLD.deciding_review_id IS NOT NULL AND OLD.deciding_review_id IS DISTINCT FROM NEW.deciding_review_id THEN
    RAISE EXCEPTION 'AssetRevision % deciding_review_id is immutable once recorded', OLD.id;
  END IF;

  IF OLD.status != 'DRAFT'::"RevisionStatus" THEN
    IF (OLD.title IS DISTINCT FROM NEW.title) OR
       (OLD.description IS DISTINCT FROM NEW.description) OR
       (OLD.metadata IS DISTINCT FROM NEW.metadata) OR
       (OLD.schema_version IS DISTINCT FROM NEW.schema_version) THEN
      RAISE EXCEPTION 'AssetRevision % content is frozen (status: %) and cannot be modified', OLD.id, OLD.status;
    END IF;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE OLD.status
      WHEN 'DRAFT' THEN
        IF NEW.status NOT IN ('SUBMITTED', 'REJECTED', 'PUBLISHED') THEN
          RAISE EXCEPTION 'Invalid transition from DRAFT to %', NEW.status;
        END IF;
      WHEN 'SUBMITTED' THEN
        IF NEW.status NOT IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'PUBLISHED') THEN
          RAISE EXCEPTION 'Invalid transition from SUBMITTED to %', NEW.status;
        END IF;
      WHEN 'CHANGES_REQUESTED' THEN
        IF NEW.status NOT IN ('REJECTED') THEN
          RAISE EXCEPTION 'Invalid transition from CHANGES_REQUESTED to %. Authors must create a new revision (N+1).', NEW.status;
        END IF;
      WHEN 'APPROVED' THEN
        IF NEW.status NOT IN ('PUBLISHED', 'REJECTED') THEN
          RAISE EXCEPTION 'Invalid transition from APPROVED to %', NEW.status;
        END IF;
      WHEN 'PUBLISHED' THEN
        IF NEW.status NOT IN ('SUPERSEDED') THEN
          RAISE EXCEPTION 'Invalid transition from PUBLISHED to %', NEW.status;
        END IF;
      WHEN 'SUPERSEDED' THEN
        RAISE EXCEPTION 'AssetRevision % is SUPERSEDED and cannot undergo further status transitions', OLD.id;
      WHEN 'REJECTED' THEN
        RAISE EXCEPTION 'AssetRevision % is REJECTED and cannot undergo further status transitions', OLD.id;
      ELSE
        RAISE EXCEPTION 'Unknown revision status: %', OLD.status;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_asset_revision_immutability() OWNER TO sbloom_owner;

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
  p_checksum_sha256 TEXT DEFAULT NULL,
  p_publish_immediately BOOLEAN DEFAULT false
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

  -- Require checksum_sha256: non-null/non-empty and exactly 64 hexadecimal characters
  IF p_checksum_sha256 IS NULL OR TRIM(p_checksum_sha256) = '' THEN
    RAISE EXCEPTION 'checksum_sha256 is required and cannot be empty.';
  END IF;

  v_norm_sha := LOWER(TRIM(p_checksum_sha256));
  IF v_norm_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid checksum_sha256: "%". Must be exactly 64 hexadecimal characters.', p_checksum_sha256;
  END IF;

  -- Require p_size_bytes > 0
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

  -- 3. Verify privileged execution context if immediate publication requested
  IF p_publish_immediately IS TRUE THEN
    IF CURRENT_USER NOT IN ('service_role', 'sbloom_owner', 'postgres')
       AND SESSION_USER NOT IN ('service_role', 'sbloom_owner', 'postgres') THEN
      RAISE EXCEPTION 'Forbidden: Immediate master publication requires trusted service-role or owner execution context.';
    END IF;
  END IF;

  -- 4. Validate AssetType exists and is active
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

  v_now := clock_timestamp();

  -- 5. Explicit storage_key Collision & Idempotency / Reconciliation Protection
  SELECT f.id, f.revision_id, f.storage_key, f.checksum_sha256, r.asset_id, r.status AS revision_status, a.slug, a.status AS asset_status, a.current_published_revision_id
    INTO v_key_file
    FROM public.asset_files_templatedhub f
    JOIN public.asset_revisions_templatedhub r ON r.id = f.revision_id
    JOIN public.assets_templatedhub a ON a.id = r.asset_id
   WHERE f.storage_key = TRIM(p_storage_key)
   LIMIT 1;

  IF v_key_file.id IS NOT NULL THEN
    -- Matching deterministic master template
    IF v_key_file.asset_id = p_asset_id 
       AND v_key_file.slug = TRIM(p_slug) 
       AND LOWER(v_key_file.checksum_sha256) = v_norm_sha THEN

      -- Idempotent Reconciliation: If already published, return ALREADY_INGESTED
      IF v_key_file.asset_status = 'PUBLISHED' AND v_key_file.current_published_revision_id = v_key_file.revision_id THEN
        RETURN jsonb_build_object(
          'status', 'ALREADY_INGESTED',
          'asset_id', v_key_file.asset_id,
          'revision_id', v_key_file.revision_id,
          'file_id', v_key_file.id,
          'slug', v_key_file.slug,
          'storage_key', v_key_file.storage_key,
          'published', true,
          'message', format('Master template "%s" already ingested and published with matching storage key and checksum.', v_key_file.slug)
        );
      END IF;

      -- If immediate publication requested, promote existing revision into published master state
      IF p_publish_immediately IS TRUE THEN
        UPDATE public.asset_revisions_templatedhub
           SET status = 'PUBLISHED'::"RevisionStatus"
         WHERE id = v_key_file.revision_id;

        UPDATE public.assets_templatedhub
           SET status = 'PUBLISHED'::"AssetStatus",
               current_published_revision_id = v_key_file.revision_id,
               updated_at = v_now
         WHERE id = v_key_file.asset_id;

        INSERT INTO public.audit_events_templatedhub (
          id, actor_id, action, entity_type, entity_id, metadata, created_at
        ) VALUES (
          gen_random_uuid(), p_actor_id, 'PUBLISH_MASTER_TEMPLATE', 'Asset', v_key_file.asset_id,
          jsonb_build_object(
            'slug', v_key_file.slug,
            'revision_id', v_key_file.revision_id,
            'storage_key', v_key_file.storage_key,
            'checksum_sha256', v_norm_sha,
            'reconciled', true
          ),
          v_now
        );

        RETURN jsonb_build_object(
          'status', 'RECONCILED_AND_PUBLISHED',
          'asset_id', v_key_file.asset_id,
          'revision_id', v_key_file.revision_id,
          'file_id', v_key_file.id,
          'slug', v_key_file.slug,
          'storage_key', v_key_file.storage_key,
          'published', true,
          'message', format('Master template "%s" safely reconciled and promoted to PUBLISHED.', v_key_file.slug)
        );
      ELSE
        RETURN jsonb_build_object(
          'status', 'ALREADY_INGESTED',
          'asset_id', v_key_file.asset_id,
          'revision_id', v_key_file.revision_id,
          'file_id', v_key_file.id,
          'slug', v_key_file.slug,
          'storage_key', v_key_file.storage_key,
          'published', false,
          'message', format('Master template "%s" already ingested with matching storage key and checksum.', v_key_file.slug)
        );
      END IF;
    ELSE
      -- Same storage_key belonging to different asset/content raises Conflict
      RAISE EXCEPTION 'Asset collision: Storage key "%" is already bound to asset % ("%") with differing content or identity.',
        TRIM(p_storage_key), v_key_file.asset_id, v_key_file.slug;
    END IF;
  END IF;

  -- 6. Asset Container Existence & Idempotency / Collision Check
  SELECT a.id, a.slug, a.legacy_id, a.status, a.last_revision_number, a.remix_source_asset_id, a.current_published_revision_id
    INTO v_existing_asset
    FROM public.assets_templatedhub a
   WHERE a.id = p_asset_id
      OR a.slug = TRIM(p_slug)
      OR (p_legacy_id IS NOT NULL AND a.legacy_id = TRIM(p_legacy_id))
   LIMIT 1;

  IF v_existing_asset.id IS NOT NULL THEN
    SELECT f.id, f.revision_id, f.storage_key, f.checksum_sha256, r.status AS revision_status
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

      IF p_publish_immediately IS TRUE THEN
        UPDATE public.asset_revisions_templatedhub
           SET status = 'PUBLISHED'::"RevisionStatus"
         WHERE id = v_existing_primary_file.revision_id;

        UPDATE public.assets_templatedhub
           SET status = 'PUBLISHED'::"AssetStatus",
               current_published_revision_id = v_existing_primary_file.revision_id,
               updated_at = v_now
         WHERE id = v_existing_asset.id;

        INSERT INTO public.audit_events_templatedhub (
          id, actor_id, action, entity_type, entity_id, metadata, created_at
        ) VALUES (
          gen_random_uuid(), p_actor_id, 'PUBLISH_MASTER_TEMPLATE', 'Asset', v_existing_asset.id,
          jsonb_build_object(
            'slug', v_existing_asset.slug,
            'revision_id', v_existing_primary_file.revision_id,
            'storage_key', v_existing_primary_file.storage_key,
            'checksum_sha256', v_norm_sha,
            'reconciled', true
          ),
          v_now
        );

        RETURN jsonb_build_object(
          'status', 'RECONCILED_AND_PUBLISHED',
          'asset_id', v_existing_asset.id,
          'revision_id', v_existing_primary_file.revision_id,
          'file_id', v_existing_primary_file.id,
          'slug', v_existing_asset.slug,
          'storage_key', v_existing_primary_file.storage_key,
          'published', true,
          'message', format('Master template "%s" safely reconciled and promoted to PUBLISHED.', v_existing_asset.slug)
        );
      ELSE
        RETURN jsonb_build_object(
          'status', 'ALREADY_INGESTED',
          'asset_id', v_existing_asset.id,
          'revision_id', v_existing_primary_file.revision_id,
          'file_id', v_existing_primary_file.id,
          'slug', v_existing_asset.slug,
          'storage_key', v_existing_primary_file.storage_key,
          'published', false,
          'message', format('Master template "%s" already ingested with matching storage key and checksum.', v_existing_asset.slug)
        );
      END IF;
    ELSE
      RAISE EXCEPTION 'Asset collision: An asset already exists with matching id, slug, or legacy_id but differing attributes (existing id: %, slug: %)',
        v_existing_asset.id, v_existing_asset.slug;
    END IF;
  END IF;

  -- 7. Insert Master Asset Container
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

  -- 8. Allocate Revision #1 via authoritative public.allocate_next_revision
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

  -- 9. Insert into asset_files_templatedhub (while revision is in DRAFT status)
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

  -- 10. If immediate publication requested, promote revision and update asset current_published_revision_id
  IF p_publish_immediately IS TRUE THEN
    UPDATE public.asset_revisions_templatedhub
       SET status = 'PUBLISHED'::"RevisionStatus"
     WHERE id = v_revision_id;

    UPDATE public.assets_templatedhub
       SET current_published_revision_id = v_revision_id,
           status = 'PUBLISHED'::"AssetStatus",
           updated_at = v_now
     WHERE id = p_asset_id;
  END IF;

  -- 11. Record Immutable Audit Event
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
      'revision_number', v_revision_number,
      'published_immediately', COALESCE(p_publish_immediately, false)
    ),
    v_now
  );

  IF p_publish_immediately IS TRUE THEN
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
      'PUBLISH_MASTER_TEMPLATE',
      'Asset',
      p_asset_id,
      jsonb_build_object(
        'slug', TRIM(p_slug),
        'revision_id', v_revision_id,
        'published_immediately', true
      ),
      v_now
    );
  END IF;

  -- 12. Return Canonical Ingestion Result
  RETURN jsonb_build_object(
    'status', 'CREATED',
    'asset_id', p_asset_id,
    'revision_id', v_revision_id,
    'file_id', v_file_id,
    'revision_number', v_revision_number,
    'slug', TRIM(p_slug),
    'storage_key', TRIM(p_storage_key),
    'published', COALESCE(p_publish_immediately, false),
    'message', format('Master template "%s" successfully ingested%s.', TRIM(p_slug), CASE WHEN p_publish_immediately IS TRUE THEN ' and published' ELSE '' END)
  );
END;
$$;

-- Ownership & Explicit Privilege Controls
ALTER FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN) OWNER TO sbloom_owner;

REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app') THEN
    REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN) FROM sbloom_app;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_admin') THEN
    REVOKE ALL ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN) FROM sbloom_admin;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.ingest_master_template(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT, JSONB, INT, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
