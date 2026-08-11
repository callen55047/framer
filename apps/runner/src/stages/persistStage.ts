import type { ExtractedVariant, ListingExtraction, VariantDiscoveryFilter } from "@framer/schema";
import { persistVariantSnapshot } from "../lib/apiClient.js";

/** Persist Stage: reconcile discovered variants and write per-watch headline price points. */
export async function persistStage(
  listingId: string,
  productId: string | null,
  extraction: ListingExtraction,
  scrapedAt: string,
  variants: ExtractedVariant[],
  watchIds?: string[],
  discoveryFilter?: VariantDiscoveryFilter | null
): Promise<void> {
  await persistVariantSnapshot(listingId, {
    productId,
    title: extraction.title,
    scrapedAt,
    variants,
    watchIds,
    discoveryFilter,
  });
}
