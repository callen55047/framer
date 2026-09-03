import { z } from "zod";

/**
 * The exact shape requested from the local model via LM Studio's
 * `response_format.json_schema` parameter (schema-constrained decoding). Shape is guaranteed by the
 * constraint; truth is not — see Grounding. Every field here must be
 * verifiable against the source Artifact text.
 */
export const ListingExtractionSchema = z.object({
  title: z.string().describe("The product title as it appears on the page"),
  price: z.number().describe("The current price as a plain number, no currency symbol"),
  currency: z
    .string()
    .length(3)
    .describe("ISO 4217 currency code, e.g. USD"),
  inStock: z.boolean().describe("Whether the page indicates the item is currently purchasable"),
  brand: z.string().nullable().describe("The brand/manufacturer name if present, else null"),
  modelYear: z
    .number()
    .int()
    .nullable()
    .describe("The 4-digit model year if present on the page, else null"),
});
export type ListingExtraction = z.infer<typeof ListingExtractionSchema>;

/**
 * Result of running the Grounding check over a ListingExtraction. A field is
 * "grounded" if its normalized value is present in the normalized source
 * text; ungrounded fields are stripped before the extraction is persisted.
 * See CONTEXT.md#Grounding.
 */
export const GroundingResultSchema = z.object({
  grounded: z.boolean(),
  groundedFields: z.array(z.string()),
  ungroundedFields: z.array(z.string()),
});
export type GroundingResult = z.infer<typeof GroundingResultSchema>;
