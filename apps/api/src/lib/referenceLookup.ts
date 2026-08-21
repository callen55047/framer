import {
  ASSISTANT_REFERENCE_CATEGORIES,
  ReferenceSourceCategorySchema,
  buildReferenceSearchUrl,
  getSearchableSourcesForCategory,
  type AssistantReferenceCategory,
} from "@framer/schema";

export function routeReferenceSearch(category: string, query: string) {
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

  const sources = getSearchableSourcesForCategory(parsedCategory.data as AssistantReferenceCategory);
  if (sources.length === 0) {
    throw new Error(`No searchable reference sources registered for category "${category}"`);
  }

  return { sources, query: trimmedQuery };
}

/** @deprecated Use searchReference tool instead. */
export function routeReferenceLookup(category: string, query: string) {
  const { sources, query: trimmedQuery } = routeReferenceSearch(category, query);
  const source = sources[0]!;
  const url = buildReferenceSearchUrl(source, trimmedQuery);
  return { source, url };
}
