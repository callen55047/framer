import { fetchPooled } from "../pools/fetchPool.js";
import { buildListingPageText } from "./listingPageText.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export class ReferenceFetchHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`fetch ${url} returned ${status}`);
    this.name = "ReferenceFetchHttpError";
  }
}

export interface ReferencePageFetchResult {
  url: string;
  text: string;
}

/** Fetch a reference source page and extract visible text for assistant lookup. */
export async function fetchReferencePageText(url: string): Promise<ReferencePageFetchResult> {
  const res = await fetchPooled(url, {
    headers: { "User-Agent": DEFAULT_USER_AGENT },
  });
  if (!res.ok) {
    throw new ReferenceFetchHttpError(res.status, url);
  }
  const html = await res.text();
  const text = buildListingPageText(html);
  if (text.length < 20) {
    throw new Error("fetched page had almost no visible text; likely blocked or JS-rendered");
  }
  return { url, text };
}
