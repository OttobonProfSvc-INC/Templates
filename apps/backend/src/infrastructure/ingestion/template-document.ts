import { TemplateDocument, TemplateDocumentSchema } from '@sbloom/contracts';

export interface FlatTemplateDocumentParams {
  width: number;
  height: number;
  backgroundImageUrl?: string;
  backgroundColor?: string;
}

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
export function generateFlatTemplateDocument(
  params: FlatTemplateDocumentParams
): TemplateDocument {
  if (params.width <= 0 || params.height <= 0) {
    throw new Error(
      `Invalid canvas dimensions: ${params.width}x${params.height}. Width and height must be positive numbers.`
    );
  }

  const document: TemplateDocument = {
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
  return TemplateDocumentSchema.parse(document) as TemplateDocument;
}
