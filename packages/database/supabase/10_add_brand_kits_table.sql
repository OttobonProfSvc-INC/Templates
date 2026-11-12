-- =============================================================================
-- Migration: 10_add_brand_kits_table.sql
-- Description: Create brand_kits_templatedhub table for organization brand profiles
-- Phase: 5B — Brand Kits / Organization Profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.brand_kits_templatedhub (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    tagline VARCHAR(500),
    description TEXT,
    colors JSONB NOT NULL DEFAULT '{}'::jsonb,
    typography JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact JSONB NOT NULL DEFAULT '{}'::jsonb,
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    logo_assets JSONB NOT NULL DEFAULT '{}'::jsonb,
    business JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization-wide brand profiles indexing
CREATE INDEX IF NOT EXISTS idx_brand_kits_templatedhub_name ON public.brand_kits_templatedhub (name);
CREATE INDEX IF NOT EXISTS idx_brand_kits_templatedhub_created_at ON public.brand_kits_templatedhub (created_at DESC);

-- Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_brand_kits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_kits_updated_at ON public.brand_kits_templatedhub;
CREATE TRIGGER trg_brand_kits_updated_at
    BEFORE UPDATE ON public.brand_kits_templatedhub
    FOR EACH ROW
    EXECUTE FUNCTION public.set_brand_kits_updated_at();

-- RLS: Organization-wide access
ALTER TABLE public.brand_kits_templatedhub ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_kits_select_policy ON public.brand_kits_templatedhub;
CREATE POLICY brand_kits_select_policy ON public.brand_kits_templatedhub
    FOR SELECT TO authenticated, service_role
    USING (true);

DROP POLICY IF EXISTS brand_kits_all_policy ON public.brand_kits_templatedhub;
CREATE POLICY brand_kits_all_policy ON public.brand_kits_templatedhub
    FOR ALL TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- Permissions: Grant DML to sbloom_app (inherited by service_role) and authenticated
GRANT ALL ON public.brand_kits_templatedhub TO postgres, sbloom_owner, sbloom_admin, sbloom_app, service_role, authenticated;
