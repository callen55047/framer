import { ListingRelevanceSchema } from "@framer/schema";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ListingItemKind } from "@framer/schema";

const schemaDocument = zodToJsonSchema(ListingRelevanceSchema, "ListingRelevance");

export function getListingRelevanceJsonSchema(): Record<string, unknown> {
  const definitions = (schemaDocument as { definitions?: Record<string, unknown> }).definitions;
  if (definitions && typeof definitions.ListingRelevance === "object") {
    return definitions.ListingRelevance as Record<string, unknown>;
  }
  return schemaDocument as Record<string, unknown>;
}

export function buildRelevancePromptPrefix(itemKind: ListingItemKind): string {
  const kindHint =
    itemKind === "complete_bike"
      ? "The user indicated this is a complete bike listing."
      : "The user indicated this is a bike component listing.";
  return `${kindHint}
You are classifying whether a scraped web page is a supported watchlist target for a mountain bike price-tracking app.

Set supported=true with reason "mtb_related" when the page is a purchasable product listing for:
- Mountain bikes, complete bikes, frames, forks, wheelsets, drivetrain, brakes, cockpit, tires
- Road bikes, gravel bikes, and cycling accessories clearly sold as bike gear (helmets, pads, tools, bike apparel)

Set supported=false with reason "not_a_product_listing" when the page is not a single purchasable product (blog, homepage, search results, 404, category page).

Set supported=false with reason "not_mtb_related" when it is a product listing but unrelated to bicycles or cycling (yoga mats, general fitness, unrelated electronics).

PAGE TEXT:
`;
}
