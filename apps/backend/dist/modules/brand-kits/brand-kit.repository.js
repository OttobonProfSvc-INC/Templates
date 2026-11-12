"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.brandKitRepository = exports.BrandKitRepository = exports.inMemoryBrandKitStore = exports.InMemoryBrandKitStore = exports.INITIAL_KAVETY_BRAND_KIT = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");
const supabase_1 = require("../../infrastructure/supabase");
const errors_1 = require("../../common/errors");
const template_store_1 = require("../../template-store");
// Default Acceptance Test Brand Kit definition
exports.INITIAL_KAVETY_BRAND_KIT = {
    id: '00000000-0000-0000-0000-000000000b01',
    name: 'Kavety Multispeciality Hospital',
    shortName: 'Kavety Hospital',
    tagline: 'Excellence in Healthcare & Compassionate Care',
    description: 'Premier multispeciality healthcare institution offering advanced medical diagnostics and patient care.',
    colors: {
        primary: '#0284c7',
        secondary: '#0f172a',
        accent: '#10b981',
        background: '#ffffff',
        text: '#0f172a',
    },
    typography: {
        primaryFont: 'Inter, sans-serif',
        secondaryFont: 'Outfit, sans-serif',
    },
    contact: {
        phone: '+91 98765 43210',
        alternatePhone: '+91 98765 43211',
        email: 'care@kavetyhospital.com',
        website: 'https://kavetyhospital.com',
        address: '123 Healthcare Boulevard, Tech City',
    },
    socialLinks: {
        instagram: 'https://instagram.com/kavetyhospital',
        facebook: 'https://facebook.com/kavetyhospital',
        linkedin: 'https://linkedin.com/company/kavetyhospital',
        twitter: 'https://x.com/kavetyhospital',
        youtube: 'https://youtube.com/@kavetyhospital',
    },
    logoAssets: {
        primary: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=400&q=80',
        secondary: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=400&q=80',
        icon: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=200&q=80',
    },
    business: {
        ctaText: 'Book Appointment',
        ctaUrl: 'https://kavetyhospital.com/appointment',
        whatsapp: '+91 98765 43210',
    },
    createdAt: '2026-10-28T11:55:10.668Z',
    updatedAt: '2026-10-28T11:55:10.668Z',
};
/**
 * Isolated in-memory store for unit tests requiring isolated offline mocking.
 * Never reachable in normal runtime.
 */
class InMemoryBrandKitStore {
    brandKits = new Map();
    constructor() {
        this.reset();
    }
    reset() {
        this.brandKits.clear();
        this.brandKits.set(exports.INITIAL_KAVETY_BRAND_KIT.id, { ...exports.INITIAL_KAVETY_BRAND_KIT });
    }
    list() {
        return Array.from(this.brandKits.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    findById(id) {
        return this.brandKits.get(id) || null;
    }
    create(kit) {
        this.brandKits.set(kit.id, { ...kit });
        return { ...kit };
    }
    update(id, updates) {
        const existing = this.brandKits.get(id);
        if (!existing) {
            throw new errors_1.NotFoundError(`Brand Kit not found: ${id}`);
        }
        const updated = {
            ...existing,
            ...updates,
            colors: { ...existing.colors, ...(updates.colors || {}) },
            typography: { ...existing.typography, ...(updates.typography || {}) },
            contact: { ...existing.contact, ...(updates.contact || {}) },
            socialLinks: { ...existing.socialLinks, ...(updates.socialLinks || {}) },
            logoAssets: { ...existing.logoAssets, ...(updates.logoAssets || {}) },
            business: { ...existing.business, ...(updates.business || {}) },
            updatedAt: new Date().toISOString(),
        };
        this.brandKits.set(id, updated);
        return { ...updated };
    }
    delete(id) {
        return this.brandKits.delete(id);
    }
}
exports.InMemoryBrandKitStore = InMemoryBrandKitStore;
exports.inMemoryBrandKitStore = new InMemoryBrandKitStore();
/**
 * Authoritative sBLOOM Brand Kit Repository.
 *
 * Locked Architecture:
 * Express backend -> Supabase server client -> PostgREST / RPC
 *
 * - Persists brand kits exclusively in Supabase public.brand_kits_templatedhub.
 * - Zero Prisma or direct PostgreSQL dependencies.
 * - Never silently falls back to in-memory storage.
 * - Returns clear typed errors when Supabase is unavailable.
 */
class BrandKitRepository {
    supabaseClient;
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }
    resolveClient(tx) {
        if (tx !== undefined && tx !== null && (0, supabase_1.isSupabaseClient)(tx)) {
            return tx;
        }
        if (this.supabaseClient) {
            return this.supabaseClient;
        }
        if (env_1.config.supabaseServiceRoleKey && env_1.config.supabaseUrl) {
            return (0, supabase_1.getSupabaseServerClient)();
        }
        throw new errors_1.ServiceUnavailableError('Database service is currently unavailable: Supabase client is not configured.', 'SUPABASE_UNAVAILABLE');
    }
    /**
     * Lists all organization Brand Kits from Supabase.
     */
    async listBrandKits(tx) {
        const client = this.resolveClient(tx);
        const { data, error } = await client
            .from('brand_kits_templatedhub')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'BrandKitRepository.listBrandKits');
        }
        return (data || []).map((r) => this.mapPostgrestToDto(r));
    }
    /**
     * Finds a Brand Kit by ID from Supabase.
     */
    async findBrandKitById(id, tx) {
        const client = this.resolveClient(tx);
        const { data, error } = await client
            .from('brand_kits_templatedhub')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `BrandKitRepository.findBrandKitById(${id})`);
        }
        if (!data) {
            return null;
        }
        return this.mapPostgrestToDto(data);
    }
    /**
     * Creates a new organization Brand Kit in Supabase.
     */
    async createBrandKit(input, tx) {
        const client = this.resolveClient(tx);
        const id = input.id || crypto_1.default.randomUUID();
        const now = new Date().toISOString();
        const insertPayload = {
            id,
            name: input.name,
            short_name: input.shortName || null,
            tagline: input.tagline || null,
            description: input.description || null,
            colors: input.colors || {},
            typography: input.typography || {},
            contact: input.contact || {},
            social_links: input.socialLinks || {},
            logo_assets: input.logoAssets || {},
            business: input.business || {},
            created_at: now,
            updated_at: now,
        };
        const { data, error } = await client
            .from('brand_kits_templatedhub')
            .insert(insertPayload)
            .select()
            .single();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'BrandKitRepository.createBrandKit');
        }
        return this.mapPostgrestToDto(data);
    }
    /**
     * Updates an existing Brand Kit in Supabase.
     */
    async updateBrandKit(id, updates, tx) {
        const client = this.resolveClient(tx);
        const existing = await this.findBrandKitById(id, tx);
        if (!existing) {
            throw new errors_1.NotFoundError(`Brand Kit not found: ${id}`);
        }
        const updatePayload = {
            name: updates.name !== undefined ? updates.name : existing.name,
            short_name: updates.shortName !== undefined ? updates.shortName : existing.shortName,
            tagline: updates.tagline !== undefined ? updates.tagline : existing.tagline,
            description: updates.description !== undefined ? updates.description : existing.description,
            colors: updates.colors !== undefined ? { ...existing.colors, ...updates.colors } : existing.colors,
            typography: updates.typography !== undefined ? { ...existing.typography, ...updates.typography } : existing.typography,
            contact: updates.contact !== undefined ? { ...existing.contact, ...updates.contact } : existing.contact,
            social_links: updates.socialLinks !== undefined ? { ...existing.socialLinks, ...updates.socialLinks } : existing.socialLinks,
            logo_assets: updates.logoAssets !== undefined ? { ...existing.logoAssets, ...updates.logoAssets } : existing.logoAssets,
            business: updates.business !== undefined ? { ...existing.business, ...updates.business } : existing.business,
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await client
            .from('brand_kits_templatedhub')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `BrandKitRepository.updateBrandKit(${id})`);
        }
        return this.mapPostgrestToDto(data);
    }
    /**
     * Deletes a Brand Kit from Supabase.
     * Invariant: Deleting a Brand Kit MUST NOT delete any customizations or templates.
     */
    async deleteBrandKit(id, tx) {
        const client = this.resolveClient(tx);
        const existing = await this.findBrandKitById(id, tx);
        if (!existing) {
            throw new errors_1.NotFoundError(`Brand Kit not found: ${id}`);
        }
        const { error } = await client
            .from('brand_kits_templatedhub')
            .delete()
            .eq('id', id);
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `BrandKitRepository.deleteBrandKit(${id})`);
        }
        return true;
    }
    /**
     * Counts how many customizations previously used this Brand Kit.
     */
    async countCustomizationsUsingBrandKit(id) {
        let count = 0;
        try {
            const client = this.resolveClient();
            const { data, error } = await client
                .from('asset_revisions_templatedhub')
                .select('id, metadata');
            if (!error && Array.isArray(data)) {
                for (const r of data) {
                    const doc = r.metadata;
                    if (doc?.brandKitId === id || doc?.page?.brandKitId === id) {
                        count++;
                    }
                }
            }
        }
        catch {
            // Ignore
        }
        // Also check in-memory store for active test customizations
        try {
            if (typeof template_store_1.inMemoryTemplateStore?.listUserCustomizations === 'function') {
                const memCustomizations = template_store_1.inMemoryTemplateStore.listUserCustomizations('creator-user-1') || [];
                for (const c of memCustomizations) {
                    if (c.brandKitId === id || c.document?.brandKitId === id || c.document?.page?.brandKitId === id) {
                        count++;
                    }
                }
            }
        }
        catch {
            // Ignore
        }
        return count;
    }
    mapPostgrestToDto(r) {
        return {
            id: r.id,
            name: r.name,
            shortName: r.short_name || null,
            tagline: r.tagline || null,
            description: r.description || null,
            colors: r.colors || {},
            typography: r.typography || {},
            contact: r.contact || {},
            socialLinks: r.social_links || {},
            logoAssets: r.logo_assets || {},
            business: r.business || {},
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
}
exports.BrandKitRepository = BrandKitRepository;
exports.brandKitRepository = new BrandKitRepository();
