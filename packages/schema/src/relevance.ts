import { z } from "zod";

export const ListingRelevanceReasonSchema = z.enum([
  "mtb_related",
  "not_a_product_listing",
  "not_mtb_related",
]);
export type ListingRelevanceReason = z.infer<typeof ListingRelevanceReasonSchema>;

export const ListingRelevanceSchema = z.object({
  supported: z.boolean(),
  reason: ListingRelevanceReasonSchema,
});
export type ListingRelevance = z.infer<typeof ListingRelevanceSchema>;

export const UNSUPPORTED_LISTING_PREFIX = "UNSUPPORTED_LISTING:";

export function formatUnsupportedListingMessage(reason: ListingRelevanceReason): string {
  const base = `${UNSUPPORTED_LISTING_PREFIX} This item isn't supported for the watchlist.`;
  switch (reason) {
    case "not_a_product_listing":
      return `${base} This page doesn't look like a product listing.`;
    case "not_mtb_related":
      return `${base} This product doesn't appear to be mountain bike related.`;
    default:
      return base;
  }
}

export function isUnsupportedListingError(message: string): boolean {
  return message.startsWith(UNSUPPORTED_LISTING_PREFIX);
}
