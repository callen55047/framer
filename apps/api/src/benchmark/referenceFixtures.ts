import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  fetchCatalogReferencePage as FetchCatalogReferencePage,
  searchReferenceCategory as SearchReferenceCategory,
} from "@framer/runner/lib/referenceSearch.js";

/**
 * Replays recorded reference search/page data instead of hitting the live
 * network, so the Assistant Benchmark's only live input is the model itself.
 * Each recorded case is one file in fixtures/assistant-benchmark/pages/,
 * matched by category + a substring of the search query.
 */

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(moduleDir, "../../fixtures/assistant-benchmark/pages");

interface RecordedCase {
  search: {
    category: string;
    queryContains: string;
    results: Array<{ title: string; url: string; sourceId: string; sourceName: string; sourceCategory: string }>;
    sourcesTried: string[];
    sourcesSkipped: Array<{ sourceId: string; reason: string }>;
  };
  page: {
    url: string;
    excerpt: string;
    sourceId: string | null;
    sourceName: string | null;
    sourceCategory: string | null;
  };
}

function loadRecordedCases(): RecordedCase[] {
  let files: string[];
  try {
    files = readdirSync(pagesDir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((name) => JSON.parse(readFileSync(path.join(pagesDir, name), "utf8")) as RecordedCase);
}

/**
 * Builds a `{ searchReferenceCategory, fetchCatalogReferencePage }` pair with
 * the same signatures as the live functions, for `setReferenceAdapterForTests`
 * in `chatTools.ts`. Returns empty results / throws exactly where the live
 * functions would for an unrecorded query or URL, so "no data" Scenarios
 * exercise the same code path a real miss would.
 */
export function createReplayReferenceAdapter(): {
  searchReferenceCategory: typeof SearchReferenceCategory;
  fetchCatalogReferencePage: typeof FetchCatalogReferencePage;
} {
  const cases = loadRecordedCases();

  return {
    async searchReferenceCategory(category: string, query: string, limit = 5) {
      const lowerQuery = query.toLowerCase();
      const match = cases.find(
        (entry) => entry.search.category === category && lowerQuery.includes(entry.search.queryContains.toLowerCase())
      );
      if (!match) {
        return { results: [], sourcesTried: [], sourcesSkipped: [] };
      }
      return {
        results: match.search.results.slice(0, limit),
        sourcesTried: match.search.sourcesTried,
        sourcesSkipped: match.search.sourcesSkipped,
      };
    },
    async fetchCatalogReferencePage(url: string, options?: { section?: string }) {
      const match = cases.find((entry) => entry.page.url === url);
      if (!match) {
        throw new Error(`No recorded reference page fixture for URL: ${url}`);
      }
      void options;
      return match.page;
    },
  };
}
