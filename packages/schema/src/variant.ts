import { z } from "zod";
import { FrameSizeSchema, WheelSizeInchesSchema } from "./bikeConfig.js";
import { IdSchema } from "./ids.js";

export const VariantSelectionSchema = z.enum(["all", "specific"]);
export type VariantSelection = z.infer<typeof VariantSelectionSchema>;

export const ListingVariantOptionSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});
export type ListingVariantOption = z.infer<typeof ListingVariantOptionSchema>;

/** One sellable SKU discovered on a retailer listing page. */
export const ListingVariantSchema = z.object({
  id: IdSchema,
  listingId: IdSchema,
  providerId: z.string().min(1),
  label: z.string().min(1),
  options: z.array(ListingVariantOptionSchema),
  frameSize: FrameSizeSchema.nullable(),
  wheelSizeInches: WheelSizeInchesSchema.nullable(),
  price: z.number().nonnegative(),
  currency: z.string().length(3),
  inStock: z.boolean(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});
export type ListingVariant = z.infer<typeof ListingVariantSchema>;

export const VariantPricePointSchema = z.object({
  id: IdSchema,
  variantId: IdSchema,
  watchId: IdSchema.nullable(),
  price: z.number().nonnegative(),
  currency: z.string().length(3),
  inStock: z.boolean(),
  scrapedAt: z.string().datetime(),
});
export type VariantPricePoint = z.infer<typeof VariantPricePointSchema>;

/** Aggregate headline numbers for a watch card. */
export const WatchVariantSummarySchema = z.object({
  variantSelection: VariantSelectionSchema,
  pinnedVariantId: IdSchema.nullable(),
  pinnedLabel: z.string().nullable(),
  lowestInStockPrice: z.number().nonnegative().nullable(),
  highestInStockPrice: z.number().nonnegative().nullable(),
  availableCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  currency: z.string().length(3).nullable(),
  price: z.number().nonnegative().nullable(),
  inStock: z.boolean(),
  scrapedAt: z.string().datetime().nullable(),
});
export type WatchVariantSummary = z.infer<typeof WatchVariantSummarySchema>;

/** Variant payload produced by deterministic extractors or synthesized as default. */
export const ExtractedVariantSchema = z.object({
  providerId: z.string().min(1),
  label: z.string().min(1),
  options: z.array(ListingVariantOptionSchema).default([]),
  frameSize: FrameSizeSchema.nullable().optional(),
  wheelSizeInches: WheelSizeInchesSchema.nullable().optional(),
  price: z.number().nonnegative(),
  currency: z.string().length(3),
  inStock: z.boolean(),
});
export type ExtractedVariant = z.infer<typeof ExtractedVariantSchema>;

export const VariantSnapshotSchema = z.object({
  scrapedAt: z.string().datetime(),
  variants: z.array(ExtractedVariantSchema).min(1),
});
export type VariantSnapshot = z.infer<typeof VariantSnapshotSchema>;

export const UpdateWatchVariantInputSchema = z
  .object({
    variantSelection: VariantSelectionSchema,
    listingVariantId: IdSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.variantSelection === "specific" && !data.listingVariantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "listingVariantId is required when variantSelection is specific",
        path: ["listingVariantId"],
      });
    }
  });
export type UpdateWatchVariantInput = z.infer<typeof UpdateWatchVariantInputSchema>;

/** Optional discovery filters applied when reconciling variants for a watch. */
export const VariantDiscoveryFilterSchema = z.object({
  frameSize: FrameSizeSchema.optional(),
  wheelSizeInches: WheelSizeInchesSchema.optional(),
});
export type VariantDiscoveryFilter = z.infer<typeof VariantDiscoveryFilterSchema>;

export const MISSING_VARIANT_CONFIRMATION_THRESHOLD = 2;

export function computeVariantAggregate(
  variants: Pick<ExtractedVariant, "price" | "currency" | "inStock">[]
): {
  lowestInStockPrice: number | null;
  highestInStockPrice: number | null;
  availableCount: number;
  totalCount: number;
  currency: string | null;
  price: number | null;
  inStock: boolean;
} {
  const totalCount = variants.length;
  const inStockVariants = variants.filter((variant) => variant.inStock);
  const availableCount = inStockVariants.length;
  const currency = variants[0]?.currency ?? null;

  if (inStockVariants.length === 0) {
    const fallback = variants[0];
    return {
      lowestInStockPrice: null,
      highestInStockPrice: null,
      availableCount: 0,
      totalCount,
      currency: fallback?.currency ?? null,
      price: fallback?.price ?? null,
      inStock: false,
    };
  }

  const prices = inStockVariants.map((variant) => variant.price);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);

  return {
    lowestInStockPrice: lowest,
    highestInStockPrice: highest,
    availableCount,
    totalCount,
    currency,
    price: lowest,
    inStock: true,
  };
}

export function filterVariantsByDiscovery(
  variants: ExtractedVariant[],
  filter: VariantDiscoveryFilter | null | undefined
): ExtractedVariant[] {
  if (!filter?.frameSize && !filter?.wheelSizeInches) return variants;
  return variants.filter((variant) => {
    if (filter.frameSize && variant.frameSize !== filter.frameSize) return false;
    if (filter.wheelSizeInches && variant.wheelSizeInches !== filter.wheelSizeInches) return false;
    return true;
  });
}
