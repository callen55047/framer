import { ListingExtractionSchema, type ReferenceSource, isRetailerReferenceSource, type ListingItemKind, type ProductCategory } from "@framer/schema";
import { zodToJsonSchema } from "zod-to-json-schema";

const schemaDocument = zodToJsonSchema(ListingExtractionSchema, "ListingExtraction");

/**
 * JSON Schema object for ListingExtraction, suitable for Ollama `format` and
 * OpenAI-compatible `response_format.json_schema.schema`.
 */
export function getListingExtractionJsonSchema(): Record<string, unknown> {
  const definitions = (schemaDocument as { definitions?: Record<string, unknown> }).definitions;
  if (definitions && typeof definitions.ListingExtraction === "object") {
    return definitions.ListingExtraction as Record<string, unknown>;
  }
  return schemaDocument as Record<string, unknown>;
}

const EXTRACTION_PROMPT_BODY = `You are extracting structured product listing data from a scraped retailer web page. \
Only use information that literally appears in the page text below. If a field is not present, use null where the schema allows it. \
Never guess, estimate, or use outside knowledge — every field you return must be verifiable against the page text. \
Return the current price as a plain number with no currency symbol or thousands separators.`;

/** Build the extraction prompt prefix, optionally with reference-source context. */
export function buildExtractionPromptPrefix(
  source?: ReferenceSource,
  hints?: { itemKind?: ListingItemKind; expectedCategory?: ProductCategory | null }
): string {
  let prefix = EXTRACTION_PROMPT_BODY;
  if (hints?.itemKind === "complete_bike") {
    prefix = `The user indicated this is a complete bike listing.\n${prefix}`;
  } else if (hints?.itemKind === "component" && hints.expectedCategory) {
    prefix = `The user indicated this is a ${hints.expectedCategory} component listing.\n${prefix}`;
  }
  if (source && isRetailerReferenceSource(source)) {
    prefix = `Source: ${source.name} (retailer listing page).\n${prefix}`;
  }
  return `${prefix}\n\nPAGE TEXT:\n`;
}

/** Default prefix without source context — used by tests that assert prompt shape. */
export const EXTRACTION_PROMPT_PREFIX = buildExtractionPromptPrefix();
