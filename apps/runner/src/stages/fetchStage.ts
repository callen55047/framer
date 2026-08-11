import { findReferenceSourceByUrl, type ReferenceSource } from "@framer/schema";
import { fetchPooled } from "../pools/fetchPool.js";
import { writeArtifact } from "../lib/artifactStore.js";
import { recordArtifact } from "../lib/apiClient.js";
import { augmentEcwidProductHtml } from "../lib/ecwidListing.js";
import { buildListingPageText } from "../lib/listingPageText.js";

export class FetchHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`fetch ${url} returned ${status}`);
    this.name = "FetchHttpError";
  }
}

export interface FetchResult {
  html: string;
  text: string;
  artifactId: string;
  referenceSource?: ReferenceSource;
}

/** Fetch Stage: retrieve the page, persist the raw HTML as an Artifact
 * before doing anything else with it, so extraction can always be replayed
 * against exactly what was seen on the wire. See CONTEXT.md#Artifact. */
export async function fetchStage(jobId: string, url: string): Promise<FetchResult> {
  const res = await fetchPooled(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new FetchHttpError(res.status, url);
  }
  let html = await res.text();
  html = await augmentEcwidProductHtml(html, url);

  const { path, byteSize } = await writeArtifact(jobId, "fetch", "text/html", html);
  const artifact = await recordArtifact(jobId, "fetch", "text/html", path, byteSize);

  const text = buildListingPageText(html);
  if (text.length < 20) {
    throw new Error("fetched page had almost no visible text; likely blocked or JS-rendered");
  }

  const referenceSource = findReferenceSourceByUrl(url);

  return { html, text, artifactId: artifact.id, referenceSource };
}
