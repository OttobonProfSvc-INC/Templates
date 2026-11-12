"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.brandKitService = exports.BrandKitService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const brand_kit_repository_1 = require("./brand-kit.repository");
const storage_client_1 = require("../../infrastructure/storage/storage-client");
const errors_1 = require("../../common/errors");
class BrandKitService {
    repository;
    storageService;
    constructor(repository, storageService) {
        this.repository = repository || brand_kit_repository_1.brandKitRepository;
        this.storageService = storageService || new storage_client_1.SupabaseStorageService();
    }
    /**
     * Lists all organization brand kits.
     */
    async listBrandKits() {
        const list = await this.repository.listBrandKits();
        return Promise.all(list.map(async (bk) => {
            const count = await this.repository.countCustomizationsUsingBrandKit(bk.id);
            return {
                ...bk,
                customizationCount: count,
            };
        }));
    }
    /**
     * Retrieves a single Brand Kit by ID.
     */
    async getBrandKitById(id) {
        const brandKit = await this.repository.findBrandKitById(id);
        if (!brandKit) {
            throw new errors_1.NotFoundError(`Brand Kit not found: ${id}`);
        }
        const count = await this.repository.countCustomizationsUsingBrandKit(id);
        return {
            ...brandKit,
            customizationCount: count,
        };
    }
    /**
     * Creates a new organization Brand Kit.
     */
    async createBrandKit(data) {
        return this.repository.createBrandKit(data);
    }
    /**
     * Updates an existing Brand Kit.
     */
    async updateBrandKit(id, data) {
        return this.repository.updateBrandKit(id, data);
    }
    /**
     * Duplicates an existing Brand Kit.
     * Format: <Original Name> — Copy
     * Safely copies all color, typography, contact, and logo asset references.
     */
    async duplicateBrandKit(id) {
        const existing = await this.getBrandKitById(id);
        const newId = crypto_1.default.randomUUID();
        const copyName = `${existing.name} — Copy`;
        const copyShortName = existing.shortName ? `${existing.shortName} (Copy)` : null;
        const duplicated = await this.repository.createBrandKit({
            id: newId,
            name: copyName,
            shortName: copyShortName,
            tagline: existing.tagline,
            description: existing.description,
            colors: { ...existing.colors },
            typography: { ...existing.typography },
            contact: { ...existing.contact },
            socialLinks: { ...existing.socialLinks },
            logoAssets: { ...existing.logoAssets },
            business: { ...existing.business },
        });
        return duplicated;
    }
    /**
     * Deletes a Brand Kit safely.
     * Guarantees: Does NOT delete any customizations, templates, or exports.
     */
    async deleteBrandKit(id) {
        const usageCount = await this.repository.countCustomizationsUsingBrandKit(id);
        await this.repository.deleteBrandKit(id);
        return {
            success: true,
            id,
            customizationsPreserved: usageCount,
        };
    }
    /**
     * Returns usage count of customizations previously using the Brand Kit.
     */
    async getUsageCount(id) {
        const count = await this.repository.countCustomizationsUsingBrandKit(id);
        return {
            brandKitId: id,
            customizationCount: count,
        };
    }
    /**
     * Uploads a logo asset to private Supabase storage:
     * Bucket: sBLOOM_templateshub
     * Path: brand-kits/<brand-kit-id>/<slot>-<timestamp>.<ext>
     * Generates signed URL or proxy URL without exposing service role key.
     */
    async uploadLogoAsset(brandKitId, slot, fileBuffer, contentType = 'image/png', originalFilename) {
        const existing = await this.getBrandKitById(brandKitId);
        const ext = originalFilename
            ? path_1.default.extname(originalFilename).replace('.', '') || 'png'
            : contentType.includes('svg')
                ? 'svg'
                : contentType.includes('jpeg') || contentType.includes('jpg')
                    ? 'jpg'
                    : 'png';
        const storageKey = `brand-kits/${brandKitId}/${slot}-${Date.now()}.${ext}`;
        const bucket = process.env.SBLOOM_STORAGE_BUCKET || 'sBLOOM_templateshub';
        let logoUrl = '';
        try {
            await this.storageService.uploadObject(bucket, storageKey, fileBuffer, {
                contentType,
                upsert: true,
            });
            // Generate a signed URL for display (valid for 7 days = 604800s, within 86400s max per token)
            // Or provide stable backend proxy URL /api/brand-kits/:id/logos/:slot
            try {
                const signed = await this.storageService.createSignedUrl(bucket, storageKey, 86400);
                logoUrl = signed.signedUrl;
            }
            catch {
                logoUrl = `/api/brand-kits/${brandKitId}/logos/${slot}`;
            }
        }
        catch {
            // Offline fallback: Use Base64 data URL
            logoUrl = `data:${contentType};base64,${fileBuffer.toString('base64')}`;
        }
        const updatedLogos = {
            ...existing.logoAssets,
            [slot]: logoUrl,
        };
        const updated = await this.repository.updateBrandKit(brandKitId, {
            logoAssets: updatedLogos,
        });
        return {
            brandKit: updated,
            logoUrl,
            storageKey,
        };
    }
    /**
     * Generates a preview diff of what will update and what is not mapped
     * before applying Brand Kit to a social post or website template document.
     */
    async previewApply(brandKitId, assetType, doc) {
        const brandKit = await this.getBrandKitById(brandKitId);
        const willUpdate = [];
        const notMapped = [];
        if (assetType === 'website-template') {
            const page = doc?.page || {};
            const theme = page.theme || {};
            const sections = page.sections || [];
            // Theme Colors
            if (brandKit.colors.primary) {
                willUpdate.push({
                    field: 'theme.primaryColor',
                    label: 'Primary Color',
                    oldValue: theme.primaryColor,
                    newValue: brandKit.colors.primary,
                    mapped: true,
                });
            }
            else {
                notMapped.push({ field: 'theme.primaryColor', label: 'Primary Color', mapped: false });
            }
            if (brandKit.colors.secondary) {
                willUpdate.push({
                    field: 'theme.secondaryColor',
                    label: 'Secondary Color',
                    oldValue: theme.secondaryColor,
                    newValue: brandKit.colors.secondary,
                    mapped: true,
                });
            }
            else {
                notMapped.push({ field: 'theme.secondaryColor', label: 'Secondary Color', mapped: false });
            }
            // Typography
            if (brandKit.typography.primaryFont) {
                willUpdate.push({
                    field: 'theme.headingFont',
                    label: 'Heading Font',
                    oldValue: theme.headingFont,
                    newValue: brandKit.typography.primaryFont,
                    mapped: true,
                });
            }
            else {
                notMapped.push({ field: 'theme.headingFont', label: 'Heading Font', mapped: false });
            }
            // Navbar Section
            const navbar = sections.find((s) => s.type === 'NAVBAR');
            if (navbar) {
                if (brandKit.logoAssets.primary) {
                    willUpdate.push({
                        field: 'navbar.logoUrl',
                        label: 'Navbar Logo',
                        oldValue: navbar.content?.logoUrl || '(none)',
                        newValue: brandKit.logoAssets.primary,
                        mapped: true,
                    });
                }
                if (brandKit.name) {
                    willUpdate.push({
                        field: 'navbar.brandName',
                        label: 'Navbar Brand Name',
                        oldValue: navbar.content?.brandName || '(default)',
                        newValue: brandKit.name,
                        mapped: true,
                    });
                }
            }
            // Footer Section
            const footer = sections.find((s) => s.type === 'FOOTER');
            if (footer) {
                if (brandKit.logoAssets.primary || brandKit.logoAssets.secondary) {
                    willUpdate.push({
                        field: 'footer.logoUrl',
                        label: 'Footer Logo',
                        oldValue: footer.content?.logoUrl || '(none)',
                        newValue: brandKit.logoAssets.secondary || brandKit.logoAssets.primary,
                        mapped: true,
                    });
                }
                if (brandKit.contact.email) {
                    willUpdate.push({
                        field: 'footer.email',
                        label: 'Footer Email',
                        oldValue: footer.content?.email,
                        newValue: brandKit.contact.email,
                        mapped: true,
                    });
                }
            }
            // Contact Section
            const contactSec = sections.find((s) => s.type === 'CONTACT');
            if (contactSec) {
                if (brandKit.contact.phone) {
                    willUpdate.push({
                        field: 'contact.phone',
                        label: 'Contact Phone',
                        oldValue: contactSec.content?.phone,
                        newValue: brandKit.contact.phone,
                        mapped: true,
                    });
                }
                if (brandKit.contact.address) {
                    willUpdate.push({
                        field: 'contact.address',
                        label: 'Contact Address',
                        oldValue: contactSec.content?.address,
                        newValue: brandKit.contact.address,
                        mapped: true,
                    });
                }
            }
            // Check unmapped fields
            if (!brandKit.socialLinks.instagram)
                notMapped.push({ field: 'social.instagram', label: 'Instagram', mapped: false });
            if (!brandKit.socialLinks.linkedin)
                notMapped.push({ field: 'social.linkedin', label: 'LinkedIn', mapped: false });
            if (!brandKit.contact.address && !contactSec)
                notMapped.push({ field: 'contact.address', label: 'Address', mapped: false });
        }
        else {
            // Social Post (Flat image or Structured)
            const elements = doc?.elements || [];
            const hasLogoElement = elements.some((e) => e.name?.toLowerCase().includes('logo') || e.id?.includes('logo'));
            const hasTextElements = elements.some((e) => e.type === 'text');
            if (brandKit.logoAssets.primary) {
                willUpdate.push({
                    field: 'elements.logo',
                    label: hasLogoElement ? 'Replace Logo Placeholder' : 'Insert Brand Logo Layer',
                    oldValue: hasLogoElement ? 'Current Logo' : 'None',
                    newValue: brandKit.logoAssets.primary,
                    mapped: true,
                });
            }
            if (brandKit.colors.primary) {
                willUpdate.push({
                    field: 'elements.primaryColor',
                    label: 'Primary Accent Color',
                    oldValue: 'Default',
                    newValue: brandKit.colors.primary,
                    mapped: true,
                });
            }
            if (brandKit.colors.secondary) {
                willUpdate.push({
                    field: 'elements.secondaryColor',
                    label: 'Secondary Brand Color',
                    oldValue: 'Default',
                    newValue: brandKit.colors.secondary,
                    mapped: true,
                });
            }
            if (brandKit.name) {
                willUpdate.push({
                    field: 'elements.organizationName',
                    label: 'Organization Name',
                    oldValue: 'Placeholder',
                    newValue: brandKit.name,
                    mapped: true,
                });
            }
            if (brandKit.contact.phone) {
                willUpdate.push({
                    field: 'elements.phone',
                    label: 'Contact Phone',
                    oldValue: 'Placeholder',
                    newValue: brandKit.contact.phone,
                    mapped: true,
                });
            }
            if (brandKit.contact.website) {
                willUpdate.push({
                    field: 'elements.website',
                    label: 'Website URL',
                    oldValue: 'Placeholder',
                    newValue: brandKit.contact.website,
                    mapped: true,
                });
            }
            // Unmapped
            if (!brandKit.socialLinks.instagram)
                notMapped.push({ field: 'social.instagram', label: 'Instagram', mapped: false });
            if (!brandKit.contact.address)
                notMapped.push({ field: 'contact.address', label: 'Address', mapped: false });
            if (!brandKit.business.whatsapp)
                notMapped.push({ field: 'business.whatsapp', label: 'WhatsApp', mapped: false });
        }
        return {
            brandKitId,
            brandKitName: brandKit.name,
            willUpdate,
            notMapped,
        };
    }
}
exports.BrandKitService = BrandKitService;
exports.brandKitService = new BrandKitService();
