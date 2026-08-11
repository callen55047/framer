import { z } from "zod";
import { IdSchema } from "./ids.js";
import { SpecSchema } from "./spec.js";

export const ProductCategorySchema = z.enum([
  "frame",
  "fork",
  "wheelset",
  "drivetrain",
  "brakes",
  "cockpit",
  "tires",
  "other",
]);
export type ProductCategory = z.infer<typeof ProductCategorySchema>;

/**
 * A retailer-independent thing that exists in the world, identified by
 * brand + model + model year. See CONTEXT.md#Product.
 */
export const ProductSchema = z.object({
  id: IdSchema,
  brand: z.string().min(1),
  model: z.string().min(1),
  modelYear: z.number().int().optional(),
  category: ProductCategorySchema,
  gtin: z.string().optional(),
  specs: SpecSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductInputSchema = ProductSchema.pick({
  brand: true,
  model: true,
  modelYear: true,
  category: true,
  gtin: true,
}).extend({
  specs: SpecSchema.optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>;
