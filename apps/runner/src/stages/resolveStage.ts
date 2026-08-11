import { deriveModelGuess, type ListingExtraction, type ProductCategory } from "@framer/schema";
import { resolveProductRemote } from "../lib/apiClient.js";

export interface ResolveResult {
  productId: string;
  grade: "high" | "review" | "new";
}

/**
 * Resolve Stage: Resolution itself is server-side (it needs to see the
 * whole Product catalog, which the Runner never touches directly — see
 * docs/adr/0001). This Stage just shapes the extracted fields into the
 * comparison the API expects. Category defaults to "other": RefreshListing
 * doesn't currently extract a category, so newly created Products start
 * uncategorized until ExtractSpecs (or a manual edit) fills it in.
 */
export async function resolveStage(
  extraction: ListingExtraction,
  expectedCategory?: ProductCategory | null
): Promise<ResolveResult> {
  const brand = extraction.brand ?? "Unknown";
  const modelGuess = deriveModelGuess(extraction.title, brand);
  const category = expectedCategory ?? "other";
  return resolveProductRemote({
    brand,
    modelGuess: modelGuess || extraction.title,
    modelYear: extraction.modelYear,
    gtin: null,
    category,
  });
}
