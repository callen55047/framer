import * as cheerio from "cheerio";
import {
  ASSISTANT_REFERENCE_CATEGORIES,
  ReferenceSourceCategorySchema,
  buildReferenceSearchUrl,
  findReferenceSourceByUrl,
  getSearchableSourcesForCategory,
  type AssistantReferenceCategory,
  type ReferenceSource,
} from "@framer/schema";
import {
  fetchReferencePageText,
  ReferenceBlockedError,
  ReferenceEmptyError,
} from "./referencePageFetch.js";

export interface ReferenceSearchResult {
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  sourceCategory: string;
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

export function parseReferenceSearchResults(
  html: string,
  source: ReferenceSource,
  searchUrl: string,
  limit: number
): ReferenceSearchResult[] {
  if (!source.resultLinkSelector) return [];

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const results: ReferenceSearchResult[] = [];

  $(source.resultLinkSelector).each((_, element) => {
    if (results.length >= limit) return false;
    const href = $(element).attr("href");
    if (!href) return;
    const url = resolveUrl(href, searchUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const title = $(element).text().replace(/\s+/g, " ").trim();
    if (!title) return;
    results.push({
      title,
      url,
      sourceId: source.id,
      sourceName: source.name,
      sourceCategory: source.category,
    });
  });

  return results;
}

export async function searchReferenceSource(
  source: ReferenceSource,
  query: string,
  limit: number
): Promise<{ source: ReferenceSource; results: ReferenceSearchResult[]; triedUrl: string }> {
  const searchUrl = buildReferenceSearchUrl(source, query);
  const fetched = await fetchReferencePageText(searchUrl, {
    queryTerms: query.split(/\s+/),
    isSearchPage: true,
    maxChars: 8000,
  });
  const results = parseReferenceSearchResults(fetched.html, source, searchUrl, limit);
  if (results.length === 0) {
    throw new ReferenceEmptyError(searchUrl, "no result links matched selector");
  }
  return { source, results, triedUrl: searchUrl };
}

export async function searchReferenceCategory(
  category: string,
  query: string,
  limit = 5
): Promise<{
  results: ReferenceSearchResult[];
  sourcesTried: string[];
  sourcesSkipped: Array<{ sourceId: string; reason: string }>;
}> {
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

  const perSourceLimit = Math.max(limit, 3);
  const aggregated: ReferenceSearchResult[] = [];
  const seenUrls = new Set<string>();
  const sourcesTried: string[] = [];
  const sourcesSkipped: Array<{ sourceId: string; reason: string }> = [];

  for (const source of sources) {
    if (aggregated.length >= limit) break;
    sourcesTried.push(source.id);
    try {
      const { results } = await searchReferenceSource(source, trimmedQuery, perSourceLimit);
      for (const result of results) {
        if (aggregated.length >= limit) break;
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);
        aggregated.push(result);
      }
      if (aggregated.length > 0) break;
    } catch (err) {
      const reason =
        err instanceof ReferenceBlockedError || err instanceof ReferenceEmptyError
          ? err.message
          : err instanceof Error
            ? err.message
            : "unknown error";
      sourcesSkipped.push({ sourceId: source.id, reason });
    }
  }

  return { results: aggregated, sourcesTried, sourcesSkipped };
}

export async function fetchCatalogReferencePage(
  url: string,
  options?: { section?: string }
): Promise<{
  url: string;
  excerpt: string;
  sourceId: string | null;
  sourceName: string | null;
  sourceCategory: string | null;
}> {
  const source = findReferenceSourceByUrl(url);
  if (!source) {
    throw new Error(`URL domain is not in the reference source catalog: ${url}`);
  }

  const fetched = await fetchReferencePageText(url, { section: options?.section });
  return {
    url: fetched.url,
    excerpt: fetched.text,
    sourceId: source.id,
    sourceName: source.name,
    sourceCategory: source.category,
  };
}

/** Maximum in-chat reference page fetches per user turn (fetch pool is rate-limited per domain). */
export const MAX_IN_CHAT_REFERENCE_FETCHES = 3;
