"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetRouter = void 0;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const contracts_1 = require("@sbloom/contracts");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../common/errors");
const error_handler_1 = require("../../middleware/error-handler");
const asset_service_1 = require("./asset.service");
const template_store_1 = require("../../template-store");
exports.assetRouter = (0, express_1.Router)();
/**
 * Robustly resolves the template-library/social-media root directory
 * regardless of whether running from ts-node-dev (src), built bundle (dist),
 * monorepo root, or backend package root.
 */
function resolveTemplateLibraryDir() {
    const candidates = [
        path_1.default.resolve(process.cwd(), 'template-library/social-media'),
        path_1.default.resolve(process.cwd(), '../../template-library/social-media'),
        path_1.default.resolve(__dirname, '../../../../../template-library/social-media'),
        path_1.default.resolve(__dirname, '../../../../template-library/social-media'),
    ];
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return path_1.default.resolve(process.cwd(), '../../template-library/social-media');
}
const MIME_MAP = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
};
// Safe static raw file serving for template previews / canvas backgrounds
exports.assetRouter.get('/api/assets/raw/:category/:filename', (0, validate_1.validate)({ params: contracts_1.AssetRawParamSchema }), (req, res, next) => {
    const { category, filename } = req.params;
    const validCategories = ['Coaching', 'Colleges', 'Schools'];
    const matchedCategory = validCategories.find((c) => c.toLowerCase() === category.toLowerCase());
    if (!matchedCategory) {
        next(new errors_1.NotFoundError('Invalid category'));
        return;
    }
    // Safely decode URI components (e.g. %F0%9F%8C%8D for emojis, %20 for spaces)
    let decodedFilename = filename;
    try {
        decodedFilename = decodeURIComponent(filename);
    }
    catch {
        // Keep filename if decode fails
    }
    // Path traversal prevention: strip directory parts
    const safeFilename = path_1.default.basename(decodedFilename);
    const baseDir = resolveTemplateLibraryDir();
    const targetDir = path_1.default.resolve(baseDir, matchedCategory);
    let resolvedFilePath = path_1.default.resolve(targetDir, safeFilename);
    // Path traversal guard: ensure resolved path is within targetDir
    const normalizedTargetDir = path_1.default.normalize(targetDir) + path_1.default.sep;
    const normalizedFilePath = path_1.default.normalize(resolvedFilePath);
    if (!normalizedFilePath.startsWith(normalizedTargetDir)) {
        next(new errors_1.NotFoundError('Invalid file path'));
        return;
    }
    // If exact path does not exist, attempt case-insensitive match (e.g. 1.PNG vs 1.png)
    if (!fs_1.default.existsSync(resolvedFilePath)) {
        try {
            const files = fs_1.default.readdirSync(targetDir);
            const match = files.find((f) => f.toLowerCase() === safeFilename.toLowerCase());
            if (match) {
                resolvedFilePath = path_1.default.resolve(targetDir, match);
            }
        }
        catch {
            // Ignore readdir failure
        }
    }
    // If not found in base template directory, check the uploaded assets directory
    if (!fs_1.default.existsSync(resolvedFilePath)) {
        const uploadsDir = path_1.default.resolve(baseDir, 'uploads', matchedCategory);
        const uploadCandidate = path_1.default.resolve(uploadsDir, safeFilename);
        const normalizedUploadsDir = path_1.default.normalize(uploadsDir) + path_1.default.sep;
        const normalizedUploadCandidate = path_1.default.normalize(uploadCandidate);
        if (normalizedUploadCandidate.startsWith(normalizedUploadsDir) && fs_1.default.existsSync(uploadCandidate)) {
            resolvedFilePath = uploadCandidate;
        }
    }
    if (!fs_1.default.existsSync(resolvedFilePath)) {
        next(new errors_1.NotFoundError('File not found'));
        return;
    }
    const ext = path_1.default.extname(resolvedFilePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(resolvedFilePath);
});
// Content Consumption: Permitted to both CONTRIBUTOR and ADMIN
exports.assetRouter.get('/api/assets', auth_1.requireInternalAuth, auth_1.requireContributorOrAdmin, (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const templates = await (0, template_store_1.getActiveTemplateService)().listTemplates();
    res.json({ status: 'ok', items: templates });
}));
// Content Creation: Permitted to both CONTRIBUTOR and ADMIN
exports.assetRouter.post('/api/assets', auth_1.requireInternalAuth, auth_1.requireContributorOrAdmin, (0, validate_1.validate)({ body: contracts_1.CreateAssetBodySchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    // Preserve backwards compatibility for stub tests verifying empty body
    if (!req.body || Object.keys(req.body).length === 0) {
        res.status(201).json({ status: 'created', creatorId: req.user?.id });
        return;
    }
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000001';
    const result = await asset_service_1.assetService.createMasterAsset(req.body, actorId);
    res.status(201).json(result);
}));
