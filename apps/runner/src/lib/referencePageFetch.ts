import { fetchPooled } from "../pools/fetchPool.js";
import {
  buildReferencePageText,
  truncateReferenceText,
} from "./referencePageText.js";
import {
  ReferenceFetchHttpError,
  assertReferenceContent,
} from "./referenceFetchErrors.js";

export { ReferenceFetchHttpError, ReferenceBlockedError, ReferenceEmptyError } from "./referenceFetchErrors.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface ReferencePageFetchResult {
  url: string;
  html: string;
  text: string;
}

export interface ReferencePageFetchOptions {
  section?: string;
  queryTerms?: string[];
  isSearchPage?: boolean;
  maxChars?: number;
}

/** Fetch a reference source page and extract structure-preserving text for assistant lookup. */
export async function fetchReferencePageText(
  url: string,
  options?: ReferencePageFetchOptions
): Promise<ReferencePageFetchResult> {
  const res = await fetchPooled(url, {
    headers: { "User-Agent": DEFAULT_USER_AGENT },
  });
  if (!res.ok) {
    throw new ReferenceFetchHttpError(res.status, url);
  }
  const html = await res.text();
  const rawText = buildReferencePageText(html, { section: options?.section });
  assertReferenceContent({
    html,
    text: rawText,
    url,
    queryTerms: options?.queryTerms,
    isSearchPage: options?.isSearchPage,
  });
  const maxChars = options?.maxChars ?? 12000;
  const text = truncateReferenceText(rawText, maxChars);
  return { url, html, text };
}

export { MAX_REFERENCE_EXCERPT_CHARS } from "./referencePageText.js";
