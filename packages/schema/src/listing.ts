import { z } from "zod";
import { IdSchema } from "./ids.js";
import { ListingItemKindSchema } from "./listingItem.js";
import { ProductCategorySchema } from "./product.js";

export const ListingSourceSchema = z.enum(["feed", "scrape"]);
export type ListingSource = z.infer<typeof ListingSourceSchema>;

/**
 * `active` listings are refreshed on schedule. `inactive` is terminal — the
 * listing was removed or failed repeated scheduled fetches. `unsupported`
 * means the page is not MTB-related.
 */
export const ListingStatusSchema = z.enum(["active", "inactive", "unsupported"]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

/**
 * One retailer's page offering one Product for sale. See CONTEXT.md#Listing.
 * `productId` is nullable until Resolution assigns it.
 */
export const ListingSchema = z.object({
  id: IdSchema,
  productId: IdSchema.nullable(),
  url: z.string().url(),
  domain: z.string().min(1),
  source: ListingSourceSchema,
  status: ListingStatusSchema,
  consecutiveScheduledFailures: z.number().int().nonnegative(),
  itemKind: ListingItemKindSchema,
  expectedCategory: ProductCategorySchema.nullable(),
  title: z.string().nullable(),
  lastCheckedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Listing = z.infer<typeof ListingSchema>;

export const CreateListingInputSchema = z.object({
  url: z.string().url(),
});
export type CreateListingInput = z.infer<typeof CreateListingInputSchema>;

/**
 * One observed price for a Listing at a point in time. Price history lives
 * here, never on Product — a Product's price is always derived as the
 * cheapest live Listing at query time. See CONTEXT.md#Flagged-ambiguities.
 */
export const PricePointSchema = z.object({
  id: IdSchema,
  listingId: IdSchema,
  watchId: IdSchema.nullable().optional(),
  price: z.number().nonnegative(),
  currency: z.string().length(3),
  inStock: z.boolean(),
  scrapedAt: z.string().datetime(),
});
export type PricePoint = z.infer<typeof PricePointSchema>;
