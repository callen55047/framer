import { z } from "zod";
import { ProductCategorySchema } from "./product.js";

/** What kind of purchasable item a listing URL represents. */
export const ListingItemKindSchema = z.enum(["component", "complete_bike"]);
export type ListingItemKind = z.infer<typeof ListingItemKindSchema>;

export const WatchTitleSourceSchema = z.enum(["user", "auto"]);
export type WatchTitleSource = z.infer<typeof WatchTitleSourceSchema>;

export const WatchTitleSchema = z.object({
  displayTitle: z.string().min(1).max(120),
});
export type WatchTitle = z.infer<typeof WatchTitleSchema>;
