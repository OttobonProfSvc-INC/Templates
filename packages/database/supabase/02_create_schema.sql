-- ==============================================================================
-- Script 2: Complete Schema Setup Script
-- Target: Supabase Managed PostgreSQL
-- Suffix Standard: _templatedhub (applied to all 11 application domain tables)
-- Execution: Paste and run in Supabase Dashboard -> SQL Editor.
-- Note: Wraps all operations in an atomic transaction. If any error occurs,
--       all changes are rolled back automatically.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- SECTION 1: ROLE PROVISIONING & MEMBERSHIP
-- ==============================================================================
-- In Supabase, the SQL Editor runs under role 'postgres'.
-- We establish three non-login roles to implement least-privilege separation:
--   1. sbloom_owner: Non-login role owning tables, functions, triggers, sequences.
--   2. sbloom_admin: Non-login role for administrative purge and maintenance worker.
--   3. sbloom_app:   Non-login role defining the least-privilege runtime DML boundary.
-- 'postgres' is granted membership in sbloom_owner, sbloom_admin, and sbloom_app.
-- 'service_role' is granted sbloom_app ONLY (NEVER sbloom_admin).
-- ==============================================================================

DO $$
DECLARE
  v_has_createrole boolean;
BEGIN
  SELECT (rolcreaterole OR rolsuper) INTO v_has_createrole
  FROM pg_roles 
  WHERE rolname = CURRENT_USER;

  -- 1.1 sbloom_owner
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_owner') THEN
    IF NOT COALESCE(v_has_createrole, false) THEN
      RAISE EXCEPTION 'Prerequisite failure: Current user "%" lacks CREATEROLE or SUPERUSER privilege to create role "sbloom_owner".', CURRENT_USER;
    END IF;
    CREATE ROLE sbloom_owner NOLOGIN;
  END IF;

  -- 1.2 sbloom_admin
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_admin') THEN
    IF NOT COALESCE(v_has_createrole, false) THEN
      RAISE EXCEPTION 'Prerequisite failure: Current user "%" lacks CREATEROLE or SUPERUSER privilege to create role "sbloom_admin".', CURRENT_USER;
    END IF;
    CREATE ROLE sbloom_admin NOLOGIN;
  END IF;

  -- 1.3 sbloom_app
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sbloom_app') THEN
    IF NOT COALESCE(v_has_createrole, false) THEN
      RAISE EXCEPTION 'Prerequisite failure: Current user "%" lacks CREATEROLE or SUPERUSER privilege to create role "sbloom_app".', CURRENT_USER;
    END IF;
    CREATE ROLE sbloom_app NOLOGIN;
  END IF;

  -- 1.4 Grant role memberships to postgres (DDL administrator)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT sbloom_owner TO postgres;
    GRANT sbloom_admin TO postgres;
    GRANT sbloom_app TO postgres;
  END IF;

  -- 1.5 Grant runtime DML role to service_role (Least-privilege: sbloom_app ONLY)
  -- service_role MUST NOT receive sbloom_admin to prevent unauthorized administrative purge.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT sbloom_app TO service_role;
  END IF;
END $$;

-- ==============================================================================
-- SECTION 2: ENUM DEFINITIONS (7 ENUMS)
-- ==============================================================================
-- Validates that any existing enum has matching labels; aborts if conflicting.
-- ==============================================================================

DO $$
DECLARE
  v_labels text[];
BEGIN
  -- 2.1 UserRole
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CONTRIBUTOR');
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND t.typnamespace = 'public'::regnamespace;
    IF v_labels IS DISTINCT FROM ARRAY['ADMIN', 'CONTRIBUTOR'] THEN
      RAISE EXCEPTION 'Conflict: Enum "UserRole" already exists with incompatible labels: %', v_labels;
    END IF;
  END IF;

  -- 2.2 AssetStatus
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssetStatus' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "AssetStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AssetStatus' AND t.typnamespace = 'public'::regnamespace;
    IF v_labels IS DISTINCT FROM ARRAY['DRAFT', 'PUBLISHED', 'ARCHIVED'] THEN
      RAISE EXCEPTION 'Conflict: Enum "AssetStatus" already exists with incompatible labels: %', v_labels;
    END IF;
  END IF;

  -- 2.3 RevisionStatus
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RevisionStatus' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED');
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RevisionStatus' AND t.typnamespace = 'public'::regnamespace;
    IF v_labels IS DISTINCT FROM ARRAY['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED'] THEN
      RAISE EXCEPTION 'Conflict: Enum "RevisionStatus" already exists with incompatible labels: %', v_labels;
    END IF;
  END IF;

  -- 2.4 FileRole
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FileRole' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "FileRole" AS ENUM ('PRIMARY_ENTRY', 'SOURCE_ARCHIVE', 'THUMBNAIL', 'PREVIEW_IMAGE', 'ATTACHMENT');
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'FileRole' AND t.typnamespace = 'public'::regnamespace;
    IF v_labels IS DISTINCT FROM ARRAY['PRIMARY_ENTRY', 'SOURCE_ARCHIVE', 'THUMBNAIL', 'PREVIEW_IMAGE', 'ATTACHMENT'] THEN
      RAISE EXCEPTION 'Conflict: Enum "FileRole" already exists with incompatible labels: %', v_labels;
    END IF;
  END IF;

  -- 2.5 ReviewDecision
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewDecision' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ReviewDecision' AND t.typnamespace = 'public'::regnamespace;
    IF v_labels IS DISTINCT FROM ARRAY['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'] THEN
      RAISE EXCEPTION 'Conflict: Enum "ReviewDecision" already exists with incompatible labels: %', v_labels;
    END IF;
  END IF;

  -- 2.6 UsageAction
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UsageAction' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "UsageAction" AS ENUM ('VIEW', 'DOWNLOAD', 'PREVIEW', 'REMIX');
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UsageAction' AND t.typnamespace = 'public'::regnamespace;
    IF v_labels IS DISTINCT FROM ARRAY['VIEW', 'DOWNLOAD', 'PREVIEW', 'REMIX'] THEN
      RAISE EXCEPTION 'Conflict: Enum "UsageAction" already exists with incompatible labels: %', v_labels;
    END IF;
  END IF;

  -- 2.7 JobStatus
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JobStatus' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
  ELSE
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO v_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'JobStatus' AND t.typnamespace = 'public'::regnamespace;
    IF v_labels IS DISTINCT FROM ARRAY['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] THEN
      RAISE EXCEPTION 'Conflict: Enum "JobStatus" already exists with incompatible labels: %', v_labels;
    END IF;
  END IF;
END $$;

-- ==============================================================================
-- SECTION 3: DOMAIN TABLES PRE-CHECK & CREATION (11 TABLES WITH _templatedhub)
-- ==============================================================================

DO $$
DECLARE
  v_existing_tables text[];
BEGIN
  SELECT array_agg(c.relname) INTO v_existing_tables
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relname IN (
      'users_templatedhub', 'asset_types_templatedhub', 'assets_templatedhub',
      'asset_revisions_templatedhub', 'asset_files_templatedhub', 'reviews_templatedhub',
      'audit_events_templatedhub', 'collections_templatedhub', 'collection_assets_templatedhub',
      'asset_usages_templatedhub', 'storage_deletion_jobs_templatedhub'
    );

  IF v_existing_tables IS NOT NULL AND array_length(v_existing_tables, 1) > 0 THEN
    RAISE EXCEPTION 'Conflict detected: The following _templatedhub tables already exist: %. Aborting to prevent silent overwriting.', v_existing_tables;
  END IF;
END $$;

-- 3.1 users_templatedhub
CREATE TABLE "users_templatedhub" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.2 asset_types_templatedhub
CREATE TABLE "asset_types_templatedhub" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50),
    "metadata_schema" JSONB NOT NULL DEFAULT '{}',
    "file_rules" JSONB,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_types_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.3 assets_templatedhub
CREATE TABLE "assets_templatedhub" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "legacy_id" VARCHAR(100),
    "import_source" VARCHAR(50),
    "type_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'DRAFT',
    "last_revision_number" INTEGER NOT NULL DEFAULT 0,
    "current_published_revision_id" UUID,
    "remix_source_asset_id" UUID,
    "remix_source_revision_id" UUID,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "assets_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.4 asset_revisions_templatedhub
CREATE TABLE "asset_revisions_templatedhub" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "deciding_review_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_revisions_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.5 asset_files_templatedhub
CREATE TABLE "asset_files_templatedhub" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" VARCHAR(64),
    "role" "FileRole" NOT NULL DEFAULT 'PRIMARY_ENTRY',
    "is_entry_point" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_files_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.6 reviews_templatedhub
CREATE TABLE "reviews_templatedhub" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "previous_status" VARCHAR(50) NOT NULL,
    "new_status" VARCHAR(50) NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.7 audit_events_templatedhub
CREATE TABLE "audit_events_templatedhub" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.8 collections_templatedhub
CREATE TABLE "collections_templatedhub" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.9 collection_assets_templatedhub
CREATE TABLE "collection_assets_templatedhub" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_assets_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.10 asset_usages_templatedhub
CREATE TABLE "asset_usages_templatedhub" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "revision_id" UUID,
    "user_id" UUID,
    "action" "UsageAction" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_usages_templatedhub_pkey" PRIMARY KEY ("id")
);

-- 3.11 storage_deletion_jobs_templatedhub
CREATE TABLE "storage_deletion_jobs_templatedhub" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "bucket_name" VARCHAR(100) NOT NULL DEFAULT 'sBLOOM_templateshub',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "storage_deletion_jobs_templatedhub_pkey" PRIMARY KEY ("id")
);

-- ==============================================================================
-- SECTION 4: INDEXES & CONSTRAINTS
-- ==============================================================================

-- 4.1 users_templatedhub indexes
CREATE UNIQUE INDEX "users_templatedhub_email_key" ON "users_templatedhub"("email");

-- 4.2 asset_types_templatedhub indexes
CREATE UNIQUE INDEX "asset_types_templatedhub_code_key" ON "asset_types_templatedhub"("code");

-- 4.3 assets_templatedhub indexes
CREATE UNIQUE INDEX "assets_templatedhub_slug_key" ON "assets_templatedhub"("slug");
CREATE UNIQUE INDEX "assets_templatedhub_legacy_id_key" ON "assets_templatedhub"("legacy_id");
CREATE INDEX "assets_templatedhub_status_type_id_created_at_idx" ON "assets_templatedhub"("status", "type_id", "created_at" DESC);
CREATE INDEX "assets_templatedhub_creator_id_status_updated_at_idx" ON "assets_templatedhub"("creator_id", "status", "updated_at" DESC);
CREATE INDEX "assets_templatedhub_is_featured_created_at_idx" ON "assets_templatedhub"("is_featured", "created_at" DESC);
CREATE INDEX "assets_templatedhub_remix_source_asset_id_idx" ON "assets_templatedhub"("remix_source_asset_id");
CREATE INDEX "assets_templatedhub_remix_source_composite_idx" ON "assets_templatedhub"("remix_source_asset_id", "remix_source_revision_id");

-- 4.4 asset_revisions_templatedhub indexes
CREATE UNIQUE INDEX "asset_revisions_templatedhub_deciding_review_id_key" ON "asset_revisions_templatedhub"("deciding_review_id");
CREATE INDEX "asset_revisions_templatedhub_asset_id_status_idx" ON "asset_revisions_templatedhub"("asset_id", "status");
CREATE INDEX "asset_revisions_templatedhub_created_by_id_idx" ON "asset_revisions_templatedhub"("created_by_id");
CREATE UNIQUE INDEX "asset_revisions_templatedhub_asset_id_revision_number_key" ON "asset_revisions_templatedhub"("asset_id", "revision_number");
CREATE UNIQUE INDEX "asset_revisions_templatedhub_id_asset_id_key" ON "asset_revisions_templatedhub"("id", "asset_id");

-- 4.5 asset_files_templatedhub indexes
CREATE INDEX "asset_files_templatedhub_revision_id_role_idx" ON "asset_files_templatedhub"("revision_id", "role");
CREATE INDEX "asset_files_templatedhub_storage_key_idx" ON "asset_files_templatedhub"("storage_key");

-- 4.6 reviews_templatedhub indexes
CREATE INDEX "reviews_templatedhub_asset_id_created_at_idx" ON "reviews_templatedhub"("asset_id", "created_at" DESC);
CREATE INDEX "reviews_templatedhub_revision_id_idx" ON "reviews_templatedhub"("revision_id");
CREATE INDEX "reviews_templatedhub_reviewer_id_idx" ON "reviews_templatedhub"("reviewer_id");

-- 4.7 audit_events_templatedhub indexes
CREATE INDEX "audit_events_templatedhub_actor_id_created_at_idx" ON "audit_events_templatedhub"("actor_id", "created_at" DESC);
CREATE INDEX "audit_events_templatedhub_entity_type_entity_id_idx" ON "audit_events_templatedhub"("entity_type", "entity_id");
CREATE INDEX "audit_events_templatedhub_action_created_at_idx" ON "audit_events_templatedhub"("action", "created_at" DESC);

-- 4.8 collections_templatedhub & collection_assets_templatedhub indexes
CREATE INDEX "collections_templatedhub_user_id_is_public_idx" ON "collections_templatedhub"("user_id", "is_public");
CREATE INDEX "collection_assets_templatedhub_collection_id_position_idx" ON "collection_assets_templatedhub"("collection_id", "position");
CREATE UNIQUE INDEX "collection_assets_templatedhub_collection_id_asset_id_key" ON "collection_assets_templatedhub"("collection_id", "asset_id");

-- 4.9 asset_usages_templatedhub indexes
CREATE INDEX "asset_usages_templatedhub_asset_id_action_created_at_idx" ON "asset_usages_templatedhub"("asset_id", "action", "created_at" DESC);
CREATE INDEX "asset_usages_templatedhub_user_id_action_idx" ON "asset_usages_templatedhub"("user_id", "action");

-- 4.10 storage_deletion_jobs_templatedhub indexes
CREATE INDEX "storage_deletion_jobs_templatedhub_status_created_at_idx" ON "storage_deletion_jobs_templatedhub"("status", "created_at");

-- 4.11 Domain Check Constraint (Asset archive consistency)
ALTER TABLE "assets_templatedhub"
  ADD CONSTRAINT "chk_asset_archive_consistency"
  CHECK (
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL) OR
    ("status" != 'ARCHIVED' AND "archived_at" IS NULL)
  );

-- ==============================================================================
-- SECTION 5: FOREIGN KEY RELATIONSHIPS
-- ==============================================================================

ALTER TABLE "assets_templatedhub" ADD CONSTRAINT "assets_templatedhub_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "asset_types_templatedhub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets_templatedhub" ADD CONSTRAINT "assets_templatedhub_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users_templatedhub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets_templatedhub" ADD CONSTRAINT "assets_templatedhub_current_published_revision_id_id_fkey" FOREIGN KEY ("current_published_revision_id", "id") REFERENCES "asset_revisions_templatedhub"("id", "asset_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets_templatedhub" ADD CONSTRAINT "assets_templatedhub_remix_source_asset_id_fkey" FOREIGN KEY ("remix_source_asset_id") REFERENCES "assets_templatedhub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets_templatedhub" ADD CONSTRAINT "assets_templatedhub_remix_source_revision_id_remix_source__fkey" FOREIGN KEY ("remix_source_revision_id", "remix_source_asset_id") REFERENCES "asset_revisions_templatedhub"("id", "asset_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_revisions_templatedhub" ADD CONSTRAINT "asset_revisions_templatedhub_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets_templatedhub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_revisions_templatedhub" ADD CONSTRAINT "asset_revisions_templatedhub_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users_templatedhub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_revisions_templatedhub" ADD CONSTRAINT "asset_revisions_templatedhub_deciding_review_id_fkey" FOREIGN KEY ("deciding_review_id") REFERENCES "reviews_templatedhub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_files_templatedhub" ADD CONSTRAINT "asset_files_templatedhub_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "asset_revisions_templatedhub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews_templatedhub" ADD CONSTRAINT "reviews_templatedhub_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets_templatedhub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews_templatedhub" ADD CONSTRAINT "reviews_templatedhub_revision_id_asset_id_fkey" FOREIGN KEY ("revision_id", "asset_id") REFERENCES "asset_revisions_templatedhub"("id", "asset_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews_templatedhub" ADD CONSTRAINT "reviews_templatedhub_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users_templatedhub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_events_templatedhub" ADD CONSTRAINT "audit_events_templatedhub_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users_templatedhub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "collections_templatedhub" ADD CONSTRAINT "collections_templatedhub_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_templatedhub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_assets_templatedhub" ADD CONSTRAINT "collection_assets_templatedhub_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections_templatedhub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_assets_templatedhub" ADD CONSTRAINT "collection_assets_templatedhub_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets_templatedhub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_usages_templatedhub" ADD CONSTRAINT "asset_usages_templatedhub_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets_templatedhub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_usages_templatedhub" ADD CONSTRAINT "asset_usages_templatedhub_revision_id_asset_id_fkey" FOREIGN KEY ("revision_id", "asset_id") REFERENCES "asset_revisions_templatedhub"("id", "asset_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_usages_templatedhub" ADD CONSTRAINT "asset_usages_templatedhub_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_templatedhub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- SECTION 6: TABLE OWNERSHIP (sbloom_owner)
-- ==============================================================================

ALTER TABLE "users_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "asset_types_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "assets_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "asset_revisions_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "asset_files_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "reviews_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "audit_events_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "collections_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "collection_assets_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "asset_usages_templatedhub" OWNER TO sbloom_owner;
ALTER TABLE "storage_deletion_jobs_templatedhub" OWNER TO sbloom_owner;

-- ==============================================================================
-- SECTION 7: STORED PROCEDURES & TRIGGER FUNCTIONS (19 ROUTINES)
-- ==============================================================================

-- 7.1 resolve_storage_bucket (SECURITY INVOKER, STABLE)
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
  -- Only trusted administrative sessions (SESSION_USER IN ('sbloom_owner', 'sbloom_admin', 'postgres'))
  -- can supply a bucket override differing from the canonical production bucket.
  IF v_override != v_canonical_bucket THEN
    IF SESSION_USER NOT IN ('sbloom_owner', 'sbloom_admin', 'postgres') THEN
      RAISE EXCEPTION 'Security violation: Database role % is not authorized to select noncanonical storage bucket "%"', SESSION_USER, v_override;
    END IF;
  END IF;

  RETURN v_override;
END;
$$;
ALTER FUNCTION public.resolve_storage_bucket() OWNER TO sbloom_owner;

-- 7.2 check_revision_review_linkage (Constraint Trigger Function, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_revision_review_linkage()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_review public.reviews_templatedhub%ROWTYPE;
  v_reviewer_role text;
  v_reviewer_active boolean;
BEGIN
  IF NEW.status IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') AND 
     OLD.status IN ('SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED') THEN
    
    IF NEW.deciding_review_id IS NULL THEN
      RAISE EXCEPTION 'Workflow integrity violation: Transitioning revision % from % to % requires a non-NULL deciding_review_id',
        NEW.id, OLD.status, NEW.status;
    END IF;

    SELECT * INTO v_review
      FROM public.reviews_templatedhub
     WHERE id = NEW.deciding_review_id;

    IF v_review.id IS NULL THEN
      RAISE EXCEPTION 'Workflow integrity violation: Deciding review % does not exist', NEW.deciding_review_id;
    END IF;

    IF v_review.revision_id != NEW.id THEN
      RAISE EXCEPTION 'Workflow integrity violation: Deciding review % targets revision % but was attached to revision %',
        v_review.id, v_review.revision_id, NEW.id;
    END IF;

    IF v_review.asset_id != NEW.asset_id THEN
      RAISE EXCEPTION 'Workflow integrity violation: Deciding review % targets asset % but revision belongs to asset %',
        v_review.id, v_review.asset_id, NEW.asset_id;
    END IF;

    IF v_review.previous_status != OLD.status::text THEN
      RAISE EXCEPTION 'Workflow integrity violation: Review previous_status (%) does not match revision previous status (%)',
        v_review.previous_status, OLD.status;
    END IF;

    IF v_review.new_status != NEW.status::text THEN
      RAISE EXCEPTION 'Workflow integrity violation: Review new_status (%) does not match revision target status (%)',
        v_review.new_status, NEW.status;
    END IF;

    IF NEW.status = 'APPROVED' AND v_review.decision != 'APPROVED' THEN
      RAISE EXCEPTION 'Workflow integrity violation: Revision status is APPROVED but review decision is %', v_review.decision;
    END IF;

    IF NEW.status = 'CHANGES_REQUESTED' AND v_review.decision != 'CHANGES_REQUESTED' THEN
      RAISE EXCEPTION 'Workflow integrity violation: Revision status is CHANGES_REQUESTED but review decision is %', v_review.decision;
    END IF;

    IF NEW.status = 'REJECTED' AND v_review.decision != 'REJECTED' THEN
      RAISE EXCEPTION 'Workflow integrity violation: Revision status is REJECTED but review decision is %', v_review.decision;
    END IF;

    IF v_review.reviewer_id = NEW.created_by_id THEN
      RAISE EXCEPTION 'Peer-review integrity violation: Author % cannot review or decide their own revision %',
        NEW.created_by_id, NEW.id;
    END IF;

    SELECT role::text, is_active INTO v_reviewer_role, v_reviewer_active
      FROM public.users_templatedhub
     WHERE id = v_review.reviewer_id;

    IF v_reviewer_role IS NULL OR v_reviewer_role != 'ADMIN' OR v_reviewer_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Reviewer eligibility violation: User % is not an active system administrator (role: %, is_active: %)',
        v_review.reviewer_id, v_reviewer_role, v_reviewer_active;
    END IF;
  ELSE
    IF OLD.status = 'DRAFT' AND NEW.status = 'SUBMITTED' THEN
      IF NEW.deciding_review_id IS NOT NULL THEN
        RAISE EXCEPTION 'Workflow integrity violation: Unreviewed revision % cannot have a deciding_review_id', NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.check_revision_review_linkage() OWNER TO sbloom_owner;

-- 7.3 record_review_decision (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.record_review_decision(
  p_revision_id UUID,
  p_reviewer_id UUID,
  p_decision "ReviewDecision",
  p_comments TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_asset_id uuid;
  v_current_status "RevisionStatus";
  v_author_id uuid;
  v_new_status "RevisionStatus";
  v_review_id uuid;
  v_reviewer_role text;
  v_reviewer_active boolean;
BEGIN
  -- Obtain parent asset ID safely
  SELECT ar.asset_id INTO v_asset_id
    FROM public.asset_revisions_templatedhub ar
   WHERE ar.id = p_revision_id;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'AssetRevision % does not exist', p_revision_id;
  END IF;

  -- Level 1: Acquire Container Lock
  PERFORM 1 FROM public.assets_templatedhub WHERE id = v_asset_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent asset % does not exist or was concurrently removed', v_asset_id;
  END IF;

  -- Level 2: Acquire Revision Lock and re-read status atomically under lock
  SELECT ar.status, ar.created_by_id
    INTO v_current_status, v_author_id
    FROM public.asset_revisions_templatedhub ar
   WHERE ar.id = p_revision_id AND ar.asset_id = v_asset_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AssetRevision % does not exist or was concurrently removed', p_revision_id;
  END IF;

  IF v_current_status != 'SUBMITTED'::"RevisionStatus" THEN
    RAISE EXCEPTION 'Cannot record review decision for revision % in status % (must be SUBMITTED)',
      p_revision_id, v_current_status;
  END IF;

  -- Prevent self-review
  IF p_reviewer_id = v_author_id THEN
    RAISE EXCEPTION 'Peer-review integrity violation: Author % cannot review or decide their own revision %',
      p_reviewer_id, p_revision_id;
  END IF;

  -- Level 4: Lock and verify reviewer role
  SELECT role::text, is_active INTO v_reviewer_role, v_reviewer_active
    FROM public.users_templatedhub
   WHERE id = p_reviewer_id
     FOR SHARE;

  IF NOT FOUND OR v_reviewer_role IS NULL OR v_reviewer_role != 'ADMIN' OR v_reviewer_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Reviewer eligibility violation: User % is not an active system administrator (role: %, is_active: %)',
      p_reviewer_id, v_reviewer_role, v_reviewer_active;
  END IF;

  CASE p_decision
    WHEN 'APPROVED'::"ReviewDecision" THEN
      v_new_status := 'APPROVED'::"RevisionStatus";
    WHEN 'CHANGES_REQUESTED'::"ReviewDecision" THEN
      v_new_status := 'CHANGES_REQUESTED'::"RevisionStatus";
    WHEN 'REJECTED'::"ReviewDecision" THEN
      v_new_status := 'REJECTED'::"RevisionStatus";
    ELSE
      RAISE EXCEPTION 'Invalid review decision: %', p_decision;
  END CASE;

  v_review_id := gen_random_uuid();
  INSERT INTO public.reviews_templatedhub (
    id, asset_id, revision_id, reviewer_id,
    previous_status, new_status, decision, comments, created_at
  ) VALUES (
    v_review_id, v_asset_id, p_revision_id, p_reviewer_id,
    v_current_status::text, v_new_status::text, p_decision, p_comments, NOW()
  );

  UPDATE public.asset_revisions_templatedhub
     SET status = v_new_status,
         deciding_review_id = v_review_id
   WHERE id = p_revision_id;

  RETURN jsonb_build_object(
    'review_id', v_review_id,
    'revision_id', p_revision_id,
    'asset_id', v_asset_id,
    'status', v_new_status,
    'decision', p_decision
  );
END;
$$;
ALTER FUNCTION public.record_review_decision(UUID, UUID, "ReviewDecision", TEXT) OWNER TO sbloom_owner;

-- 7.4 submit_draft_revision (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.submit_draft_revision(
  p_revision_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_asset_id uuid;
  v_status "RevisionStatus";
BEGIN
  -- Obtain parent asset ID safely
  SELECT ar.asset_id INTO v_asset_id
    FROM public.asset_revisions_templatedhub ar
   WHERE ar.id = p_revision_id;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'AssetRevision % does not exist', p_revision_id;
  END IF;

  -- Level 1: Acquire Container Lock
  PERFORM 1 FROM public.assets_templatedhub WHERE id = v_asset_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent asset % does not exist or was concurrently removed', v_asset_id;
  END IF;

  -- Level 2: Acquire Revision Lock and re-read status atomically under lock
  SELECT ar.status INTO v_status
    FROM public.asset_revisions_templatedhub ar
   WHERE ar.id = p_revision_id AND ar.asset_id = v_asset_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AssetRevision % does not exist or was concurrently removed', p_revision_id;
  END IF;

  IF v_status != 'DRAFT'::"RevisionStatus" THEN
    RAISE EXCEPTION 'Cannot submit revision %; current status is % (must be DRAFT)', p_revision_id, v_status;
  END IF;

  UPDATE public.asset_revisions_templatedhub
     SET status = 'SUBMITTED'::"RevisionStatus"
   WHERE id = p_revision_id;

  RETURN jsonb_build_object('revision_id', p_revision_id, 'status', 'SUBMITTED');
END;
$$;
ALTER FUNCTION public.submit_draft_revision(UUID) OWNER TO sbloom_owner;

-- 7.5 publish_asset_revision (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.publish_asset_revision(
  p_asset_id UUID,
  p_revision_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old_published_id uuid;
  v_target_status "RevisionStatus";
  v_target_asset_id uuid;
BEGIN
  -- Level 1: Container Lock
  SELECT current_published_revision_id INTO v_old_published_id
    FROM public.assets_templatedhub
   WHERE id = p_asset_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset % does not exist', p_asset_id;
  END IF;

  -- Level 2: Lock affected revisions in deterministic order (UUID asc)
  PERFORM 1 
     FROM public.asset_revisions_templatedhub 
    WHERE id IN (COALESCE(v_old_published_id, p_revision_id), p_revision_id)
    ORDER BY id ASC
      FOR UPDATE;

  SELECT status, asset_id INTO v_target_status, v_target_asset_id
    FROM public.asset_revisions_templatedhub
   WHERE id = p_revision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target revision % does not exist or was concurrently removed', p_revision_id;
  END IF;

  IF v_target_asset_id != p_asset_id THEN
    RAISE EXCEPTION 'Revision % does not belong to asset %', p_revision_id, p_asset_id;
  END IF;

  IF v_target_status != 'APPROVED'::"RevisionStatus" THEN
    RAISE EXCEPTION 'Cannot publish revision % in status % (must be APPROVED)', p_revision_id, v_target_status;
  END IF;

  -- Supersede currently published revision if different
  IF v_old_published_id IS NOT NULL AND v_old_published_id != p_revision_id THEN
    UPDATE public.asset_revisions_templatedhub 
       SET status = 'SUPERSEDED'::"RevisionStatus" 
     WHERE id = v_old_published_id;
  END IF;

  -- Transition new revision to PUBLISHED
  UPDATE public.asset_revisions_templatedhub 
     SET status = 'PUBLISHED'::"RevisionStatus" 
    WHERE id = p_revision_id;

  -- Update parent asset pointer
  UPDATE public.assets_templatedhub 
     SET current_published_revision_id = p_revision_id,
         status = 'PUBLISHED'::"AssetStatus"
   WHERE id = p_asset_id;

  RETURN jsonb_build_object(
    'asset_id', p_asset_id,
    'published_revision_id', p_revision_id,
    'superseded_revision_id', v_old_published_id
  );
END;
$$;
ALTER FUNCTION public.publish_asset_revision(UUID, UUID) OWNER TO sbloom_owner;

-- 7.6 allocate_next_revision (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.allocate_next_revision(
  p_asset_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_schema_version INT DEFAULT 1,
  p_created_by_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_next_rev int;
  v_revision_id uuid;
  v_creator_active boolean;
BEGIN
  -- Level 4: Verify author if supplied
  IF p_created_by_id IS NOT NULL THEN
    SELECT is_active INTO v_creator_active
      FROM public.users_templatedhub
     WHERE id = p_created_by_id;

    IF v_creator_active IS NULL OR v_creator_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Author % does not exist or is inactive', p_created_by_id;
    END IF;
  END IF;

  -- Level 1: Container Lock
  SELECT last_revision_number + 1 INTO v_next_rev
    FROM public.assets_templatedhub
   WHERE id = p_asset_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset % does not exist', p_asset_id;
  END IF;

  -- Set allocation context token
  PERFORM set_config('sbloom.revision_allocation_context', 'allocate_next_revision', true);

  UPDATE public.assets_templatedhub
     SET last_revision_number = v_next_rev,
         updated_at = NOW()
   WHERE id = p_asset_id;

  v_revision_id := gen_random_uuid();
  INSERT INTO public.asset_revisions_templatedhub (
    id, asset_id, revision_number, title, description,
    metadata, schema_version, status, created_by_id, created_at
  ) VALUES (
    v_revision_id, p_asset_id, v_next_rev, p_title, p_description,
    p_metadata, p_schema_version, 'DRAFT'::"RevisionStatus", p_created_by_id, NOW()
  );

  RETURN jsonb_build_object(
    'revision_id', v_revision_id,
    'revision_number', v_next_rev,
    'status', 'DRAFT'
  );
END;
$$;
ALTER FUNCTION public.allocate_next_revision(UUID, TEXT, TEXT, JSONB, INT, UUID) OWNER TO sbloom_owner;

-- 7.7 archive_asset (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.archive_asset(
  p_asset_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old_status "AssetStatus";
  v_actor_role text;
  v_actor_active boolean;
BEGIN
  SELECT status INTO v_old_status
    FROM public.assets_templatedhub
   WHERE id = p_asset_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset % does not exist', p_asset_id;
  END IF;

  IF v_old_status = 'ARCHIVED'::"AssetStatus" THEN
    RAISE EXCEPTION 'Asset % is already archived', p_asset_id;
  END IF;

  -- Level 4: Verify administrator actor
  SELECT role::text, is_active INTO v_actor_role, v_actor_active
    FROM public.users_templatedhub
   WHERE id = p_actor_id
     FOR SHARE;

  IF NOT FOUND OR v_actor_role IS NULL OR v_actor_role != 'ADMIN' OR v_actor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: Actor % is not an active administrator', p_actor_id;
  END IF;

  UPDATE public.assets_templatedhub
     SET status = 'ARCHIVED'::"AssetStatus",
         archived_at = NOW(),
         updated_at = NOW()
   WHERE id = p_asset_id;

  INSERT INTO public.audit_events_templatedhub (
    id, actor_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), p_actor_id, 'ARCHIVE_ASSET', 'Asset', p_asset_id,
    jsonb_build_object('previous_status', v_old_status), NOW()
  );

  RETURN jsonb_build_object(
    'asset_id', p_asset_id,
    'status', 'ARCHIVED',
    'previous_status', v_old_status
  );
END;
$$;
ALTER FUNCTION public.archive_asset(UUID, UUID) OWNER TO sbloom_owner;

-- 7.8 unarchive_asset (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.unarchive_asset(
  p_asset_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old_status "AssetStatus";
  v_actor_role text;
  v_actor_active boolean;
BEGIN
  SELECT status INTO v_old_status
    FROM public.assets_templatedhub
   WHERE id = p_asset_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset % does not exist', p_asset_id;
  END IF;

  IF v_old_status != 'ARCHIVED'::"AssetStatus" THEN
    RAISE EXCEPTION 'Asset % is not archived (current status: %)', p_asset_id, v_old_status;
  END IF;

  -- Level 4: Verify administrator actor
  SELECT role::text, is_active INTO v_actor_role, v_actor_active
    FROM public.users_templatedhub
   WHERE id = p_actor_id
     FOR SHARE;

  IF NOT FOUND OR v_actor_role IS NULL OR v_actor_role != 'ADMIN' OR v_actor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: Actor % is not an active administrator', p_actor_id;
  END IF;

  UPDATE public.assets_templatedhub
     SET status = 'DRAFT'::"AssetStatus",
         archived_at = NULL,
         updated_at = NOW()
   WHERE id = p_asset_id;

  INSERT INTO public.audit_events_templatedhub (
    id, actor_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), p_actor_id, 'UNARCHIVE_ASSET', 'Asset', p_asset_id,
    jsonb_build_object('previous_status', v_old_status), NOW()
  );

  RETURN jsonb_build_object(
    'asset_id', p_asset_id,
    'status', 'DRAFT',
    'previous_status', 'ARCHIVED'
  );
END;
$$;
ALTER FUNCTION public.unarchive_asset(UUID, UUID) OWNER TO sbloom_owner;

-- 7.9 delete_draft_revision (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.delete_draft_revision(
  p_revision_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_asset_id uuid;
  v_revision_number int;
  v_status "RevisionStatus";
  v_author_id uuid;
  v_actor_role text;
  v_actor_active boolean;
  v_file_count int;
BEGIN
  -- Obtain parent asset ID safely
  SELECT ar.asset_id INTO v_asset_id
    FROM public.asset_revisions_templatedhub ar
   WHERE ar.id = p_revision_id;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'AssetRevision % does not exist', p_revision_id;
  END IF;

  -- Level 1: Acquire Container Lock
  PERFORM 1 FROM public.assets_templatedhub WHERE id = v_asset_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent asset % does not exist or was concurrently removed', v_asset_id;
  END IF;

  -- Level 2: Acquire Revision Lock and re-read status under lock
  SELECT ar.revision_number, ar.status, ar.created_by_id
    INTO v_revision_number, v_status, v_author_id
    FROM public.asset_revisions_templatedhub ar
   WHERE ar.id = p_revision_id AND ar.asset_id = v_asset_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AssetRevision % does not exist or was concurrently removed', p_revision_id;
  END IF;

  -- Level 3: Acquire child file locks in deterministic order
  PERFORM 1 
     FROM public.asset_files_templatedhub 
    WHERE revision_id = p_revision_id
    ORDER BY id ASC
      FOR UPDATE;

  IF v_status != 'DRAFT'::"RevisionStatus" THEN
    RAISE EXCEPTION 'Cannot delete AssetRevision % in status %; only unsubmitted DRAFT revisions may be deleted',
      p_revision_id, v_status;
  END IF;

  -- Level 4: Lock actor row and verify authorization
  SELECT role::text, is_active INTO v_actor_role, v_actor_active
    FROM public.users_templatedhub
   WHERE id = p_actor_id
     FOR SHARE;

  IF NOT FOUND OR v_actor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Actor % is inactive or does not exist', p_actor_id;
  END IF;

  IF p_actor_id != v_author_id AND (v_actor_role IS NULL OR v_actor_role != 'ADMIN') THEN
    RAISE EXCEPTION 'Access denied: User % is neither the author nor an administrator', p_actor_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.assets_templatedhub WHERE current_published_revision_id = p_revision_id) THEN
    RAISE EXCEPTION 'Integrity violation: Cannot delete revision % referenced as current_published_revision', p_revision_id;
  END IF;

  -- Transactionally queue storage deletions
  INSERT INTO public.storage_deletion_jobs_templatedhub (
    id, storage_key, bucket_name, status, attempts, created_at
  )
  SELECT 
    gen_random_uuid(),
    af.storage_key,
    public.resolve_storage_bucket(),
    'PENDING'::"JobStatus",
    0,
    NOW()
  FROM public.asset_files_templatedhub af
 WHERE af.revision_id = p_revision_id;

  GET DIAGNOSTICS v_file_count = ROW_COUNT;

  DELETE FROM public.asset_files_templatedhub WHERE revision_id = p_revision_id;
  DELETE FROM public.asset_revisions_templatedhub WHERE id = p_revision_id;

  INSERT INTO public.audit_events_templatedhub (
    id, actor_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    p_actor_id,
    'DELETE_DRAFT_REVISION',
    'AssetRevision',
    p_revision_id,
    jsonb_build_object(
      'asset_id', v_asset_id,
      'revision_number', v_revision_number,
      'queued_file_count', v_file_count
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'revision_id', p_revision_id,
    'asset_id', v_asset_id,
    'revision_number', v_revision_number,
    'deleted_file_count', v_file_count,
    'status', 'DELETED'
  );
END;
$$;
ALTER FUNCTION public.delete_draft_revision(UUID, UUID) OWNER TO sbloom_owner;

-- 7.10 process_asset_revision_immutability (SECURITY DEFINER)
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
        IF NEW.status NOT IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') THEN
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

-- 7.11 process_asset_revision_delete (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.process_asset_revision_delete()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('sbloom.admin_purge_active', true) = 'true' THEN
    IF SESSION_USER IN ('sbloom_owner', 'sbloom_admin', 'postgres') THEN
      RETURN OLD;
    ELSE
      RAISE EXCEPTION 'Security violation: Unauthorized purge bypass attempt by role %', SESSION_USER;
    END IF;
  END IF;

  IF CURRENT_USER != 'sbloom_owner' THEN
    RAISE EXCEPTION 'Security violation: Direct deletion of asset_revisions_templatedhub by role % is prohibited', CURRENT_USER;
  END IF;

  IF OLD.status != 'DRAFT'::"RevisionStatus" THEN
    RAISE EXCEPTION 'Cannot delete AssetRevision % in status %; only unsubmitted DRAFT revisions may be deleted', 
      OLD.id, OLD.status;
  END IF;

  RETURN OLD;
END;
$$;
ALTER FUNCTION public.process_asset_revision_delete() OWNER TO sbloom_owner;

-- 7.12 process_asset_file_immutability (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.process_asset_file_immutability()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
BEGIN
  IF current_setting('sbloom.admin_purge_active', true) = 'true' AND TG_OP = 'DELETE' THEN
    IF SESSION_USER IN ('sbloom_owner', 'sbloom_admin', 'postgres') THEN
      RETURN OLD;
    ELSE
      RAISE EXCEPTION 'Security violation: Unauthorized purge bypass attempt by role %', SESSION_USER;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT status::text INTO v_new_status FROM public.asset_revisions_templatedhub WHERE id = NEW.revision_id FOR SHARE;
    IF v_new_status IS NULL THEN RAISE EXCEPTION 'Target revision % does not exist', NEW.revision_id; END IF;
    IF v_new_status != 'DRAFT' THEN
      RAISE EXCEPTION 'Cannot insert AssetFile into frozen revision % (status: %); files can only be added to DRAFT revisions', 
        NEW.revision_id, v_new_status;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT status::text INTO v_old_status FROM public.asset_revisions_templatedhub WHERE id = OLD.revision_id FOR SHARE;
    IF v_old_status IS NULL THEN RAISE EXCEPTION 'Attached revision % does not exist', OLD.revision_id; END IF;
    IF v_old_status != 'DRAFT' THEN
      RAISE EXCEPTION 'Cannot delete AssetFile % attached to frozen revision % (status: %); files can only be removed from DRAFT revisions', 
        OLD.id, OLD.revision_id, v_old_status;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT status::text INTO v_old_status FROM public.asset_revisions_templatedhub WHERE id = OLD.revision_id FOR SHARE;
    IF v_old_status IS NULL THEN RAISE EXCEPTION 'Source revision % does not exist', OLD.revision_id; END IF;
    IF v_old_status != 'DRAFT' THEN
      RAISE EXCEPTION 'Cannot update AssetFile % attached to frozen revision % (status: %)', OLD.id, OLD.revision_id, v_old_status;
    END IF;

    IF OLD.revision_id IS DISTINCT FROM NEW.revision_id THEN
      SELECT status::text INTO v_new_status FROM public.asset_revisions_templatedhub WHERE id = NEW.revision_id FOR SHARE;
      IF v_new_status IS NULL THEN RAISE EXCEPTION 'Target revision % does not exist', NEW.revision_id; END IF;
      IF v_new_status != 'DRAFT' THEN
        RAISE EXCEPTION 'Cannot move AssetFile % to frozen revision % (status: %); files can only be attached to DRAFT revisions', 
          NEW.id, NEW.revision_id, v_new_status;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_asset_file_immutability() OWNER TO sbloom_owner;

-- 7.13 process_protect_asset_revision_counter (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.process_protect_asset_revision_counter()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_max_existing int;
BEGIN
  IF CURRENT_USER != 'sbloom_owner' THEN
    RAISE EXCEPTION 'Security violation: Direct modification of assets.last_revision_number by role % is prohibited',
      CURRENT_USER;
  END IF;

  IF current_setting('sbloom.revision_allocation_context', true) IS DISTINCT FROM 'allocate_next_revision' THEN
    RAISE EXCEPTION 'Security violation: assets.last_revision_number can only be advanced within public.allocate_next_revision';
  END IF;

  IF NEW.last_revision_number != OLD.last_revision_number + 1 THEN
    RAISE EXCEPTION 'Counter integrity violation: assets.last_revision_number must increment by exactly 1 (attempted % -> %)',
      OLD.last_revision_number, NEW.last_revision_number;
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) INTO v_max_existing
    FROM public.asset_revisions_templatedhub
   WHERE asset_id = NEW.id;

  IF NEW.last_revision_number <= v_max_existing THEN
    RAISE EXCEPTION 'Counter consistency violation: new last_revision_number (%) must be strictly greater than existing maximum revision (%)',
      NEW.last_revision_number, v_max_existing;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_protect_asset_revision_counter() OWNER TO sbloom_owner;

-- 7.14 process_asset_revision_insert_defaults (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.process_asset_revision_insert_defaults()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_asset_last_rev int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'DRAFT'::"RevisionStatus" THEN
    RAISE EXCEPTION 'Security violation: New revisions must be created in DRAFT status (attempted: %)', NEW.status;
  END IF;
  IF NEW.deciding_review_id IS NOT NULL THEN
    RAISE EXCEPTION 'Security violation: New revisions cannot specify deciding_review_id at creation (must be NULL)';
  END IF;

  SELECT last_revision_number INTO v_asset_last_rev
    FROM public.assets_templatedhub
   WHERE id = NEW.asset_id;

  IF v_asset_last_rev IS NULL THEN
    RAISE EXCEPTION 'Security violation: Parent asset % does not exist', NEW.asset_id;
  END IF;

  IF NEW.revision_number != v_asset_last_rev THEN
    RAISE EXCEPTION 'Revision allocation mismatch: new revision_number (%) does not match asset last_revision_number (%)',
      NEW.revision_number, v_asset_last_rev;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_asset_revision_insert_defaults() OWNER TO sbloom_owner;

-- 7.15 check_asset_published_consistency (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_asset_published_consistency()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rev_status text;
BEGIN
  IF current_setting('sbloom.admin_purge_active', true) = 'true' THEN
    IF SESSION_USER IN ('sbloom_owner', 'sbloom_admin', 'postgres') THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Security violation: Unauthorized purge bypass attempt by role %', SESSION_USER;
    END IF;
  END IF;

  IF NEW.current_published_revision_id IS NOT NULL THEN
    SELECT status::text INTO v_rev_status 
      FROM public.asset_revisions_templatedhub 
     WHERE id = NEW.current_published_revision_id;

    IF v_rev_status IS NULL THEN
      RAISE EXCEPTION 'Asset.current_published_revision_id % does not exist', NEW.current_published_revision_id;
    END IF;

    IF v_rev_status != 'PUBLISHED' THEN
      RAISE EXCEPTION 'Asset % points to revision % which has status % (must be PUBLISHED)', 
        NEW.id, NEW.current_published_revision_id, v_rev_status;
    END IF;

    IF NEW.status != 'PUBLISHED'::"AssetStatus" THEN
      RAISE EXCEPTION 'Asset % has current_published_revision_id set but asset.status is % (must be PUBLISHED)', 
        NEW.id, NEW.status;
    END IF;
  ELSE
    IF NEW.status = 'PUBLISHED'::"AssetStatus" THEN
      RAISE EXCEPTION 'Asset % has status PUBLISHED but current_published_revision_id is NULL', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.check_asset_published_consistency() OWNER TO sbloom_owner;

-- 7.16 check_revision_published_consistency (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_revision_published_consistency()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_referencing_asset_id uuid;
BEGIN
  IF current_setting('sbloom.admin_purge_active', true) = 'true' THEN
    IF SESSION_USER IN ('sbloom_owner', 'sbloom_admin', 'postgres') THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Security violation: Unauthorized purge bypass attempt by role %', SESSION_USER;
    END IF;
  END IF;

  IF OLD.status = 'PUBLISHED'::"RevisionStatus" AND NEW.status != 'PUBLISHED'::"RevisionStatus" THEN
    SELECT id INTO v_referencing_asset_id
      FROM public.assets_templatedhub
     WHERE current_published_revision_id = NEW.id;

    IF v_referencing_asset_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot transition revision % to % while Asset % current_published_revision_id still points to it', 
        NEW.id, NEW.status, v_referencing_asset_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.check_revision_published_consistency() OWNER TO sbloom_owner;

-- 7.17 process_storage_deletion_job_transition (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.process_storage_deletion_job_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'Integrity violation: storage_deletion_jobs.id is immutable';
  END IF;

  IF OLD.storage_key IS DISTINCT FROM NEW.storage_key THEN
    RAISE EXCEPTION 'Integrity violation: storage_deletion_jobs.storage_key is immutable';
  END IF;

  IF OLD.bucket_name IS DISTINCT FROM NEW.bucket_name THEN
    RAISE EXCEPTION 'Integrity violation: storage_deletion_jobs.bucket_name is immutable';
  END IF;

  IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Integrity violation: storage_deletion_jobs.created_at timestamp is immutable';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE OLD.status
      WHEN 'PENDING' THEN
        IF NEW.status NOT IN ('PROCESSING') THEN
          RAISE EXCEPTION 'Invalid storage deletion job transition from PENDING to %', NEW.status;
        END IF;
      WHEN 'PROCESSING' THEN
        IF NEW.status NOT IN ('COMPLETED', 'PENDING', 'FAILED') THEN
          RAISE EXCEPTION 'Invalid storage deletion job transition from PROCESSING to %', NEW.status;
        END IF;
      WHEN 'FAILED' THEN
        IF NEW.status NOT IN ('PENDING') THEN
          RAISE EXCEPTION 'Invalid storage deletion job transition from FAILED to %', NEW.status;
        END IF;
        IF SESSION_USER NOT IN ('sbloom_owner', 'sbloom_admin', 'postgres') THEN
          RAISE EXCEPTION 'Security violation: Only sbloom_admin or sbloom_owner can recover FAILED storage deletion jobs (caller: %)', SESSION_USER;
        END IF;
      WHEN 'COMPLETED' THEN
        RAISE EXCEPTION 'Terminal state violation: Storage deletion job % is COMPLETED and cannot undergo further status transitions', OLD.id;
      ELSE
        RAISE EXCEPTION 'Unknown storage deletion job status: %', OLD.status;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.process_storage_deletion_job_transition() OWNER TO sbloom_owner;

-- 7.18 admin_purge_asset (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_purge_asset(
  p_asset_id UUID,
  p_admin_user_id UUID,
  p_ticket_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_admin_role text;
  v_admin_active boolean;
  v_rev_count int;
  v_file_count int;
  v_result jsonb;
BEGIN
  IF SESSION_USER NOT IN ('sbloom_admin', 'sbloom_owner', 'postgres') THEN
    RAISE EXCEPTION 'Security violation: Only sbloom_admin can execute admin_purge_asset (caller: %)', SESSION_USER;
  END IF;

  PERFORM 1 FROM public.assets_templatedhub WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset % does not exist', p_asset_id;
  END IF;

  -- Level 4: Verify administrator actor
  SELECT role::text, is_active INTO v_admin_role, v_admin_active
    FROM public.users_templatedhub
   WHERE id = p_admin_user_id
     FOR SHARE;

  IF NOT FOUND OR v_admin_role IS NULL OR v_admin_role != 'ADMIN' OR v_admin_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: Actor % is not an active system administrator', p_admin_user_id;
  END IF;

  SELECT count(*) INTO v_rev_count FROM public.asset_revisions_templatedhub WHERE asset_id = p_asset_id;
  SELECT count(*) INTO v_file_count 
    FROM public.asset_files_templatedhub af 
    JOIN public.asset_revisions_templatedhub ar ON af.revision_id = ar.id 
   WHERE ar.asset_id = p_asset_id;

  INSERT INTO public.audit_events_templatedhub (
    id, actor_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    p_admin_user_id,
    'ADMIN_PURGE_ASSET',
    'Asset',
    p_asset_id,
    jsonb_build_object(
      'ticket_reference', p_ticket_reference,
      'db_caller', SESSION_USER,
      'purged_revision_count', v_rev_count,
      'purged_file_count', v_file_count,
      'legal_basis', 'RIGHT_TO_BE_FORGOTTEN_OR_DMCA'
    ),
    NOW()
  );

  INSERT INTO public.storage_deletion_jobs_templatedhub (
    id, storage_key, bucket_name, status, attempts, max_attempts, created_at
  )
  SELECT 
    gen_random_uuid(), 
    af.storage_key, 
    public.resolve_storage_bucket(), 
    'PENDING'::"JobStatus", 
    0, 
    5, 
    NOW()
  FROM public.asset_files_templatedhub af
  JOIN public.asset_revisions_templatedhub ar ON af.revision_id = ar.id
  WHERE ar.asset_id = p_asset_id;

  -- Activate bypass token
  PERFORM set_config('sbloom.admin_purge_active', 'true', true);

  UPDATE public.assets_templatedhub SET current_published_revision_id = NULL, status = 'DRAFT'::"AssetStatus" WHERE id = p_asset_id;

  UPDATE public.assets_templatedhub 
     SET remix_source_revision_id = NULL, 
         remix_source_asset_id = NULL 
   WHERE remix_source_asset_id = p_asset_id;

  UPDATE public.asset_revisions_templatedhub SET deciding_review_id = NULL WHERE asset_id = p_asset_id;

  DELETE FROM public.collection_assets_templatedhub WHERE asset_id = p_asset_id;
  DELETE FROM public.asset_usages_templatedhub WHERE asset_id = p_asset_id;
  DELETE FROM public.reviews_templatedhub WHERE asset_id = p_asset_id;
  DELETE FROM public.asset_files_templatedhub WHERE revision_id IN (SELECT id FROM public.asset_revisions_templatedhub WHERE asset_id = p_asset_id);
  DELETE FROM public.asset_revisions_templatedhub WHERE asset_id = p_asset_id;
  DELETE FROM public.assets_templatedhub WHERE id = p_asset_id;

  v_result := jsonb_build_object(
    'status', 'PURGED',
    'asset_id', p_asset_id,
    'ticket_reference', p_ticket_reference,
    'revisions_purged', v_rev_count,
    'files_queued', v_file_count
  );

  RETURN v_result;
END;
$$;
ALTER FUNCTION public.admin_purge_asset(UUID, UUID, TEXT) OWNER TO sbloom_owner;

-- 7.19 process_audit_events_immutable (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.process_audit_events_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Tamper violation: audit_events table is append-only; updates and deletions are prohibited';
END;
$$;
ALTER FUNCTION public.process_audit_events_immutable() OWNER TO sbloom_owner;

-- ==============================================================================
-- SECTION 8: TRIGGERS (10 TRIGGERS)
-- ==============================================================================

CREATE CONSTRAINT TRIGGER trg_verify_review_linkage
AFTER UPDATE OF status, deciding_review_id ON public.asset_revisions_templatedhub
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_revision_review_linkage();

CREATE TRIGGER trg_asset_revision_immutability
BEFORE UPDATE ON public.asset_revisions_templatedhub
FOR EACH ROW
EXECUTE FUNCTION public.process_asset_revision_immutability();

CREATE TRIGGER trg_asset_revision_delete
BEFORE DELETE ON public.asset_revisions_templatedhub
FOR EACH ROW
EXECUTE FUNCTION public.process_asset_revision_delete();

CREATE TRIGGER trg_asset_file_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.asset_files_templatedhub
FOR EACH ROW
EXECUTE FUNCTION public.process_asset_file_immutability();

CREATE TRIGGER trg_protect_asset_revision_counter
BEFORE UPDATE OF last_revision_number ON public.assets_templatedhub
FOR EACH ROW
EXECUTE FUNCTION public.process_protect_asset_revision_counter();

CREATE TRIGGER trg_asset_revision_insert_defaults
BEFORE INSERT ON public.asset_revisions_templatedhub
FOR EACH ROW
EXECUTE FUNCTION public.process_asset_revision_insert_defaults();

CREATE CONSTRAINT TRIGGER trg_verify_asset_published_consistency
AFTER INSERT OR UPDATE OF current_published_revision_id, status ON public.assets_templatedhub
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_asset_published_consistency();

CREATE CONSTRAINT TRIGGER trg_verify_revision_published_consistency
AFTER UPDATE OF status ON public.asset_revisions_templatedhub
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_revision_published_consistency();

CREATE TRIGGER trg_storage_deletion_job_transition
BEFORE UPDATE ON public.storage_deletion_jobs_templatedhub
FOR EACH ROW
EXECUTE FUNCTION public.process_storage_deletion_job_transition();

CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.audit_events_templatedhub
FOR EACH ROW
EXECUTE FUNCTION public.process_audit_events_immutable();

-- ==============================================================================
-- SECTION 9: ROW LEVEL SECURITY (RLS) & POLICIES
-- ==============================================================================
-- In Supabase, enabling RLS protects tables from inadvertent exposure via PostgREST.
-- Default-deny applies to roles without BYPASSRLS (anon, authenticated, PUBLIC).
-- Explicit policies are created for sbloom_app to allow granted DML operations.
-- service_role has BYPASSRLS in Supabase and postgres is table owner/superuser.
-- ==============================================================================

-- 9.1 Enable RLS on all 11 tables
ALTER TABLE public.users_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_types_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_revisions_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_files_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_assets_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_usages_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_deletion_jobs_templatedhub ENABLE ROW LEVEL SECURITY;

-- 9.2 Scoped RLS Policies for sbloom_app (Governed by table/column grants)
CREATE POLICY sbloom_app_all_policy ON public.users_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.asset_types_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.assets_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.asset_revisions_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.asset_files_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.reviews_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.audit_events_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.collections_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.collection_assets_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.asset_usages_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);
CREATE POLICY sbloom_app_all_policy ON public.storage_deletion_jobs_templatedhub FOR ALL TO sbloom_app USING (true) WITH CHECK (true);

-- 9.3 Scoped RLS Policy for sbloom_admin
CREATE POLICY sbloom_admin_all_policy ON public.storage_deletion_jobs_templatedhub FOR ALL TO sbloom_admin USING (true) WITH CHECK (true);

-- Zero policies created for anon, authenticated, or PUBLIC.
-- They remain strictly blocked by RLS default-deny and table revocations.

-- ==============================================================================
-- SECTION 10: PRIVILEGES, RBAC & LEAST-PRIVILEGE GRANTS
-- ==============================================================================

-- 10.1 Object-level privilege revokes on the 11 domain tables from PUBLIC, anon, authenticated, and service_role
-- (Scoped strictly to sBLOOM domain objects; never schema-wide to preserve shared Supabase projects.
--  service_role direct privileges are revoked so it accesses domain tables solely via inherited sbloom_app)
REVOKE ALL ON TABLE
  public.users_templatedhub,
  public.asset_types_templatedhub,
  public.assets_templatedhub,
  public.asset_revisions_templatedhub,
  public.asset_files_templatedhub,
  public.reviews_templatedhub,
  public.audit_events_templatedhub,
  public.collections_templatedhub,
  public.collection_assets_templatedhub,
  public.asset_usages_templatedhub,
  public.storage_deletion_jobs_templatedhub
FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE
      public.users_templatedhub,
      public.asset_types_templatedhub,
      public.assets_templatedhub,
      public.asset_revisions_templatedhub,
      public.asset_files_templatedhub,
      public.reviews_templatedhub,
      public.audit_events_templatedhub,
      public.collections_templatedhub,
      public.collection_assets_templatedhub,
      public.asset_usages_templatedhub,
      public.storage_deletion_jobs_templatedhub
    FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE
      public.users_templatedhub,
      public.asset_types_templatedhub,
      public.assets_templatedhub,
      public.asset_revisions_templatedhub,
      public.asset_files_templatedhub,
      public.reviews_templatedhub,
      public.audit_events_templatedhub,
      public.collections_templatedhub,
      public.collection_assets_templatedhub,
      public.asset_usages_templatedhub,
      public.storage_deletion_jobs_templatedhub
    FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE
      public.users_templatedhub,
      public.asset_types_templatedhub,
      public.assets_templatedhub,
      public.asset_revisions_templatedhub,
      public.asset_files_templatedhub,
      public.reviews_templatedhub,
      public.audit_events_templatedhub,
      public.collections_templatedhub,
      public.collection_assets_templatedhub,
      public.asset_usages_templatedhub,
      public.storage_deletion_jobs_templatedhub
    FROM service_role;
  END IF;
END $$;

-- 10.2 Explicit object-level EXECUTE revokes on all 19 sBLOOM routines
-- (Revokes default PUBLIC execute and explicitly strips execute from anon, authenticated, and service_role.
--  Zero schema-wide ALL FUNCTIONS IN SCHEMA or global default privileges are altered)
REVOKE ALL ON FUNCTION
  public.resolve_storage_bucket(),
  public.check_revision_review_linkage(),
  public.record_review_decision(UUID, UUID, "ReviewDecision", TEXT),
  public.submit_draft_revision(UUID),
  public.publish_asset_revision(UUID, UUID),
  public.allocate_next_revision(UUID, TEXT, TEXT, JSONB, INT, UUID),
  public.archive_asset(UUID, UUID),
  public.unarchive_asset(UUID, UUID),
  public.delete_draft_revision(UUID, UUID),
  public.process_asset_revision_immutability(),
  public.process_asset_revision_delete(),
  public.process_asset_file_immutability(),
  public.process_protect_asset_revision_counter(),
  public.process_asset_revision_insert_defaults(),
  public.check_asset_published_consistency(),
  public.check_revision_published_consistency(),
  public.process_storage_deletion_job_transition(),
  public.admin_purge_asset(UUID, UUID, TEXT),
  public.process_audit_events_immutable()
FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION
      public.resolve_storage_bucket(),
      public.check_revision_review_linkage(),
      public.record_review_decision(UUID, UUID, "ReviewDecision", TEXT),
      public.submit_draft_revision(UUID),
      public.publish_asset_revision(UUID, UUID),
      public.allocate_next_revision(UUID, TEXT, TEXT, JSONB, INT, UUID),
      public.archive_asset(UUID, UUID),
      public.unarchive_asset(UUID, UUID),
      public.delete_draft_revision(UUID, UUID),
      public.process_asset_revision_immutability(),
      public.process_asset_revision_delete(),
      public.process_asset_file_immutability(),
      public.process_protect_asset_revision_counter(),
      public.process_asset_revision_insert_defaults(),
      public.check_asset_published_consistency(),
      public.check_revision_published_consistency(),
      public.process_storage_deletion_job_transition(),
      public.admin_purge_asset(UUID, UUID, TEXT),
      public.process_audit_events_immutable()
    FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION
      public.resolve_storage_bucket(),
      public.check_revision_review_linkage(),
      public.record_review_decision(UUID, UUID, "ReviewDecision", TEXT),
      public.submit_draft_revision(UUID),
      public.publish_asset_revision(UUID, UUID),
      public.allocate_next_revision(UUID, TEXT, TEXT, JSONB, INT, UUID),
      public.archive_asset(UUID, UUID),
      public.unarchive_asset(UUID, UUID),
      public.delete_draft_revision(UUID, UUID),
      public.process_asset_revision_immutability(),
      public.process_asset_revision_delete(),
      public.process_asset_file_immutability(),
      public.process_protect_asset_revision_counter(),
      public.process_asset_revision_insert_defaults(),
      public.check_asset_published_consistency(),
      public.check_revision_published_consistency(),
      public.process_storage_deletion_job_transition(),
      public.admin_purge_asset(UUID, UUID, TEXT),
      public.process_audit_events_immutable()
    FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION
      public.resolve_storage_bucket(),
      public.check_revision_review_linkage(),
      public.record_review_decision(UUID, UUID, "ReviewDecision", TEXT),
      public.submit_draft_revision(UUID),
      public.publish_asset_revision(UUID, UUID),
      public.allocate_next_revision(UUID, TEXT, TEXT, JSONB, INT, UUID),
      public.archive_asset(UUID, UUID),
      public.unarchive_asset(UUID, UUID),
      public.delete_draft_revision(UUID, UUID),
      public.process_asset_revision_immutability(),
      public.process_asset_revision_delete(),
      public.process_asset_file_immutability(),
      public.process_protect_asset_revision_counter(),
      public.process_asset_revision_insert_defaults(),
      public.check_asset_published_consistency(),
      public.check_revision_published_consistency(),
      public.process_storage_deletion_job_transition(),
      public.admin_purge_asset(UUID, UUID, TEXT),
      public.process_audit_events_immutable()
    FROM service_role;
  END IF;
END $$;

-- 10.3 Schema usage privileges for sBLOOM technical roles
GRANT USAGE ON SCHEMA public TO sbloom_app, sbloom_admin;

-- Note: sbloom_owner already owns all 11 tables and 19 routines via ALTER ... OWNER TO sbloom_owner.
-- Zero schema-wide GRANT ALL ON ALL TABLES is issued, maintaining strict shared-Supabase tenant isolation.

-- 10.4 sbloom_admin privileges (Maintenance & Purge worker scoped strictly to sBLOOM domain tables)
GRANT SELECT ON
  public.users_templatedhub,
  public.asset_types_templatedhub,
  public.assets_templatedhub,
  public.asset_revisions_templatedhub,
  public.asset_files_templatedhub,
  public.reviews_templatedhub,
  public.audit_events_templatedhub,
  public.collections_templatedhub,
  public.collection_assets_templatedhub,
  public.asset_usages_templatedhub,
  public.storage_deletion_jobs_templatedhub
TO sbloom_admin;

GRANT UPDATE (status, attempts, last_error, processed_at) ON public.storage_deletion_jobs_templatedhub TO sbloom_admin;
GRANT EXECUTE ON FUNCTION public.admin_purge_asset(UUID, UUID, TEXT) TO sbloom_admin;
GRANT EXECUTE ON FUNCTION public.resolve_storage_bucket() TO sbloom_admin;
GRANT EXECUTE ON FUNCTION public.archive_asset(UUID, UUID) TO sbloom_admin;
GRANT EXECUTE ON FUNCTION public.unarchive_asset(UUID, UUID) TO sbloom_admin;

-- 10.5 sbloom_app least-privilege matrix
-- (service_role inherits these privileges cleanly via role membership granted in Section 1.5)
REVOKE ALL ON public.asset_revisions_templatedhub FROM sbloom_app;
REVOKE INSERT, DELETE ON public.asset_revisions_templatedhub FROM PUBLIC, sbloom_app, sbloom_admin;
GRANT SELECT ON public.asset_revisions_templatedhub TO sbloom_app;
GRANT UPDATE (title, description, metadata, schema_version) ON public.asset_revisions_templatedhub TO sbloom_app;

REVOKE ALL ON public.reviews_templatedhub FROM sbloom_app;
GRANT SELECT ON public.reviews_templatedhub TO sbloom_app;

REVOKE ALL ON public.assets_templatedhub FROM sbloom_app;
GRANT SELECT ON public.assets_templatedhub TO sbloom_app;
GRANT INSERT (id, slug, legacy_id, import_source, type_id, creator_id, is_featured, remix_source_asset_id, remix_source_revision_id) ON public.assets_templatedhub TO sbloom_app;
GRANT UPDATE (slug, type_id, is_featured) ON public.assets_templatedhub TO sbloom_app;

REVOKE ALL ON public.users_templatedhub FROM sbloom_app;
GRANT SELECT ON public.users_templatedhub TO sbloom_app;
GRANT UPDATE (name, updated_at) ON public.users_templatedhub TO sbloom_app;

REVOKE ALL ON public.audit_events_templatedhub FROM sbloom_app;
GRANT SELECT, INSERT ON public.audit_events_templatedhub TO sbloom_app;

REVOKE ALL ON public.asset_files_templatedhub FROM sbloom_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_files_templatedhub TO sbloom_app;

REVOKE ALL ON public.storage_deletion_jobs_templatedhub FROM sbloom_app;
GRANT SELECT ON public.storage_deletion_jobs_templatedhub TO sbloom_app;
GRANT UPDATE (status, attempts, last_error, processed_at) ON public.storage_deletion_jobs_templatedhub TO sbloom_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections_templatedhub TO sbloom_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_assets_templatedhub TO sbloom_app;
GRANT SELECT, INSERT ON public.asset_usages_templatedhub TO sbloom_app;
GRANT SELECT ON public.asset_types_templatedhub TO sbloom_app;

-- 10.6 Procedure execute grants to sbloom_app (inherited by service_role)
GRANT EXECUTE ON FUNCTION public.submit_draft_revision(UUID) TO sbloom_app;
GRANT EXECUTE ON FUNCTION public.record_review_decision(UUID, UUID, "ReviewDecision", TEXT) TO sbloom_app;
GRANT EXECUTE ON FUNCTION public.publish_asset_revision(UUID, UUID) TO sbloom_app;
GRANT EXECUTE ON FUNCTION public.allocate_next_revision(UUID, TEXT, TEXT, JSONB, INT, UUID) TO sbloom_app;
GRANT EXECUTE ON FUNCTION public.delete_draft_revision(UUID, UUID) TO sbloom_app;
GRANT EXECUTE ON FUNCTION public.archive_asset(UUID, UUID) TO sbloom_app;
GRANT EXECUTE ON FUNCTION public.unarchive_asset(UUID, UUID) TO sbloom_app;
GRANT EXECUTE ON FUNCTION public.resolve_storage_bucket() TO sbloom_app;

-- 10.7 Defense-in-depth reaffirmation for privileged administrative routines
REVOKE ALL ON FUNCTION public.admin_purge_asset(UUID, UUID, TEXT) FROM PUBLIC, sbloom_app;
REVOKE ALL ON FUNCTION public.resolve_storage_bucket() FROM PUBLIC;

COMMIT;
