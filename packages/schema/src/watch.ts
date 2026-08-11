import { z } from "zod";
import { IdSchema } from "./ids.js";
import { FrameSizeSchema, WheelSizeInchesSchema } from "./bikeConfig.js";
import { VariantSelectionSchema } from "./variant.js";
import { ListingItemKindSchema } from "./listingItem.js";
import { ProductCategorySchema } from "./product.js";
import { WatchTitleSourceSchema } from "./listingItem.js";

/**
 * A Watch targets either a Product (aggregate cheapest price across sellers)
 * or a Listing (one Used Item, tracked until it sells). See CONTEXT.md#Watch.
 */
export const WatchTargetTypeSchema = z.enum(["product", "listing"]);
export type WatchTargetType = z.infer<typeof WatchTargetTypeSchema>;

export const WatchSchema = z
  .object({
    id: IdSchema,
    ownerId: IdSchema,
    targetType: WatchTargetTypeSchema,
    productId: IdSchema.nullable(),
    listingId: IdSchema.nullable(),
    displayTitle: z.string().min(1).max(120).nullable(),
    titleSource: WatchTitleSourceSchema,
    frameSize: FrameSizeSchema.nullable(),
    wheelSizeInches: WheelSizeInchesSchema.nullable(),
    variantSelection: VariantSelectionSchema.default("all"),
    listingVariantId: IdSchema.nullable(),
    createdAt: z.string().datetime(),
  })
  .refine(
    (w) =>
      (w.targetType === "product" && w.productId !== null && w.listingId === null) ||
      (w.targetType === "listing" && w.listingId !== null && w.productId === null),
    { message: "targetType must match exactly one of productId / listingId" }
  );
export type Watch = z.infer<typeof WatchSchema>;

/**
 * Creating a Watch by URL is the primary entry point: the caller doesn't yet
 * know if this URL resolves to an existing Product, so the API creates (or
 * reuses) a Listing and defers Resolution to the RefreshListing job.
 */
export const CreateWatchInputSchema = z
  .object({
    url: z.string().url(),
    displayTitle: z.string().min(1).max(120).optional(),
    itemKind: ListingItemKindSchema.default("component"),
    category: ProductCategorySchema.optional(),
    frameSize: FrameSizeSchema.optional(),
    wheelSizeInches: WheelSizeInchesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.itemKind === "component" && !data.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "category is required when itemKind is component",
        path: ["category"],
      });
    }
  });
export type CreateWatchInput = z.infer<typeof CreateWatchInputSchema>;

export const UpdateWatchInputSchema = z.object({
  displayTitle: z.string().min(1).max(120),
});
export type UpdateWatchInput = z.infer<typeof UpdateWatchInputSchema>;
