import { WatchTitleSchema } from "@framer/schema";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ListingItemKind, ProductCategory } from "@framer/schema";

const schemaDocument = zodToJsonSchema(WatchTitleSchema, "WatchTitle");

export function getWatchTitleJsonSchema(): Record<string, unknown> {
  const definitions = (schemaDocument as { definitions?: Record<string, unknown> }).definitions;
  if (definitions && typeof definitions.WatchTitle === "object") {
    return definitions.WatchTitle as Record<string, unknown>;
  }
  return schemaDocument as Record<string, unknown>;
}

export function buildWatchTitlePromptPrefix(input: {
  listingTitle: string;
  domain: string;
  itemKind: ListingItemKind;
  expectedCategory?: ProductCategory | null;
}): string {
  const categoryHint =
    input.itemKind === "component" && input.expectedCategory
      ? `Component category: ${input.expectedCategory}.`
      : input.itemKind === "complete_bike"
        ? "Item type: complete bike."
        : "";
  return `Generate a short, human-friendly watchlist label (max 60 characters) for this product listing.
Retailer domain: ${input.domain}
Scraped product title: ${input.listingTitle}
${categoryHint}
The label should help the user distinguish this watch from others (e.g. include retailer name when useful).
Return only JSON matching the schema.

`;
}

export function deterministicWatchTitle(domain: string, listingTitle: string): string {
  const maxTitle = 50;
  const truncated = listingTitle.length > maxTitle ? `${listingTitle.slice(0, maxTitle - 1)}…` : listingTitle;
  const label = `${domain} — ${truncated}`;
  return label.length > 120 ? label.slice(0, 119) + "…" : label;
}
