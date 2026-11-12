"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFlatTemplateDocument = generateFlatTemplateDocument;
const contracts_1 = require("@sbloom/contracts");
/**
 * Generates an honest flat TemplateDocument for base master templates.
 *
 * Strict architectural rules:
 * - width & height must come from actual decoded image dimensions.
 * - elements must be strictly empty (elements: []).
 * - Zero synthetic placeholder overlays ("Admissions Open", phone, website, VERIFIED sBLOOM).
 * - Zero invented vector/editable layers.
 * - Strictly conforms to TemplateDocumentSchema.
 */
function generateFlatTemplateDocument(params) {
    if (params.width <= 0 || params.height <= 0) {
        throw new Error(`Invalid canvas dimensions: ${params.width}x${params.height}. Width and height must be positive numbers.`);
    }
    const document = {
        documentVersion: 1,
        canvas: {
            width: params.width,
            height: params.height,
            backgroundColor: params.backgroundColor || '#ffffff',
            backgroundImageUrl: params.backgroundImageUrl,
        },
        elements: [],
    };
    // Validate against contracts schema to guarantee 100% adherence
    return contracts_1.TemplateDocumentSchema.parse(document);
}
