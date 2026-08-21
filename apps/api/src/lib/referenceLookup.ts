import {
  ASSISTANT_REFERENCE_CATEGORIES,
  ReferenceSourceCategorySchema,
  buildReferenceSearchUrl,
  pickReferenceSourceForCategory,
  type AssistantReferenceCategory,
} from "@framer/schema";
import { fetchReferencePageText } from "@framer/runner/lib/referencePageFetch.js";

const MAX_EXCERPT_CHARS = 8000;

export function routeReferenceLookup(category: string, query: string) {
  const parsedCategory = ReferenceSourceCategorySchema.safeParse(category);
  if (!parsedCategory.success) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!(ASSISTANT_REFERENCE_CATEGORIES as readonly string[]).includes(parsedCategory.data)) {
    throw new Error(`Category "${category}" is not available for reference lookup`);
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("query is required");
  }

  const source = pickReferenceSourceForCategory(parsedCategory.data as AssistantReferenceCategory, trimmedQuery);
  if (!source) {
    throw new Error(`No reference source registered for category "${category}"`);
  }

  const url = buildReferenceSearchUrl(source, trimmedQuery);
  return { source, url };
}

export async function lookupReferencePage(category: string, query: string) {
  const { source, url } = routeReferenceLookup(category, query);
  const fetched = await fetchReferencePageText(url);
  const excerpt =
    fetched.text.length > MAX_EXCERPT_CHARS
      ? `${fetched.text.slice(0, MAX_EXCERPT_CHARS)}…`
      : fetched.text;

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceCategory: source.category,
    url: fetched.url,
    excerpt,
  };
}
