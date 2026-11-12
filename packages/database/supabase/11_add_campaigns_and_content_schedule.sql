-- =============================================================================
-- Migration: 11_add_campaigns_and_content_schedule.sql
-- Description: Create campaigns, campaign assets, and content schedule tables
-- Phase: 5D — Content Calendar + Campaign Scheduling
-- =============================================================================

-- 1. Campaigns Table
CREATE TABLE IF NOT EXISTS public.campaigns_templatedhub (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_templatedhub_name ON public.campaigns_templatedhub (name);
CREATE INDEX IF NOT EXISTS idx_campaigns_templatedhub_is_archived ON public.campaigns_templatedhub (is_archived);
CREATE INDEX IF NOT EXISTS idx_campaigns_templatedhub_created_at ON public.campaigns_templatedhub (created_at DESC);

-- 2. Campaign Assets Table (references customizations, never master templates directly)
CREATE TABLE IF NOT EXISTS public.campaign_assets_templatedhub (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns_templatedhub(id) ON DELETE CASCADE,
    customization_id UUID,
    title VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50) NOT NULL, -- 'Social Post' | 'Website Template'
    classification VARCHAR(50),      -- 'FLAT_IMAGE' | 'STRUCTURED_TEMPLATE' | 'WEBSITE_TEMPLATE'
    thumbnail_url TEXT,
    brand_kit_id UUID,
    brand_kit_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_assets_templatedhub_campaign_id ON public.campaign_assets_templatedhub (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_templatedhub_customization_id ON public.campaign_assets_templatedhub (customization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_templatedhub_created_at ON public.campaign_assets_templatedhub (created_at DESC);

-- 3. Content Schedule Table (Metadata-only scheduling; no external publishing APIs)
CREATE TABLE IF NOT EXISTS public.content_schedule_templatedhub (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns_templatedhub(id) ON DELETE CASCADE,
    campaign_asset_id UUID NOT NULL REFERENCES public.campaign_assets_templatedhub(id) ON DELETE CASCADE,
    scheduled_date VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD'
    scheduled_time VARCHAR(20),          -- e.g. '10:00 AM' or '14:30'
    channel VARCHAR(50) NOT NULL,        -- 'Instagram' | 'Facebook' | 'LinkedIn' | 'X / Twitter' | 'YouTube' | 'Website' | 'Other'
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNED', -- 'PLANNED' | 'READY' | 'PUBLISHED_MANUALLY' | 'SKIPPED'
    notes TEXT,
    published_manually_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_schedule_templatedhub_campaign_id ON public.content_schedule_templatedhub (campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_schedule_templatedhub_asset_id ON public.content_schedule_templatedhub (campaign_asset_id);
CREATE INDEX IF NOT EXISTS idx_content_schedule_templatedhub_scheduled_date ON public.content_schedule_templatedhub (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_schedule_templatedhub_status ON public.content_schedule_templatedhub (status);
CREATE INDEX IF NOT EXISTS idx_content_schedule_templatedhub_channel ON public.content_schedule_templatedhub (channel);
CREATE INDEX IF NOT EXISTS idx_content_schedule_templatedhub_created_at ON public.content_schedule_templatedhub (created_at DESC);

-- Automatic updated_at triggers
CREATE OR REPLACE FUNCTION public.set_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns_templatedhub;
CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON public.campaigns_templatedhub
    FOR EACH ROW
    EXECUTE FUNCTION public.set_campaigns_updated_at();

DROP TRIGGER IF EXISTS trg_campaign_assets_updated_at ON public.campaign_assets_templatedhub;
CREATE TRIGGER trg_campaign_assets_updated_at
    BEFORE UPDATE ON public.campaign_assets_templatedhub
    FOR EACH ROW
    EXECUTE FUNCTION public.set_campaigns_updated_at();

DROP TRIGGER IF EXISTS trg_content_schedule_updated_at ON public.content_schedule_templatedhub;
CREATE TRIGGER trg_content_schedule_updated_at
    BEFORE UPDATE ON public.content_schedule_templatedhub
    FOR EACH ROW
    EXECUTE FUNCTION public.set_campaigns_updated_at();

-- RLS: Organization-wide access
ALTER TABLE public.campaigns_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_assets_templatedhub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_schedule_templatedhub ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_select_policy ON public.campaigns_templatedhub;
CREATE POLICY campaigns_select_policy ON public.campaigns_templatedhub
    FOR SELECT TO authenticated, service_role
    USING (true);

DROP POLICY IF EXISTS campaigns_all_policy ON public.campaigns_templatedhub;
CREATE POLICY campaigns_all_policy ON public.campaigns_templatedhub
    FOR ALL TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS campaign_assets_select_policy ON public.campaign_assets_templatedhub;
CREATE POLICY campaign_assets_select_policy ON public.campaign_assets_templatedhub
    FOR SELECT TO authenticated, service_role
    USING (true);

DROP POLICY IF EXISTS campaign_assets_all_policy ON public.campaign_assets_templatedhub;
CREATE POLICY campaign_assets_all_policy ON public.campaign_assets_templatedhub
    FOR ALL TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS content_schedule_select_policy ON public.content_schedule_templatedhub;
CREATE POLICY content_schedule_select_policy ON public.content_schedule_templatedhub
    FOR SELECT TO authenticated, service_role
    USING (true);

DROP POLICY IF EXISTS content_schedule_all_policy ON public.content_schedule_templatedhub;
CREATE POLICY content_schedule_all_policy ON public.content_schedule_templatedhub
    FOR ALL TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- Permissions
GRANT ALL ON public.campaigns_templatedhub TO postgres, sbloom_owner, sbloom_admin, sbloom_app, service_role, authenticated;
GRANT ALL ON public.campaign_assets_templatedhub TO postgres, sbloom_owner, sbloom_admin, sbloom_app, service_role, authenticated;
GRANT ALL ON public.content_schedule_templatedhub TO postgres, sbloom_owner, sbloom_admin, sbloom_app, service_role, authenticated;
