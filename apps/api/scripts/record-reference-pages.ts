#!/usr/bin/env tsx
/**
 * Records one live reference search + page fetch into
 * fixtures/assistant-benchmark/pages/, for replay by referenceFixtures.ts.
 * Run once against the real network when a Scenario needs a new recorded
 * case, then commit the output — the Assistant Benchmark never hits the
 * network itself.
 *
 * Usage:
 *   tsx scripts/record-reference-pages.ts <category> <query> <queryContains> <outputName>
 *
 * Example:
 *   tsx scripts/record-reference-pages.ts bike_specs \
 *     "2024 Rocky Mountain Altitude geometry" altitude geometry-geeks-altitude-2024
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCatalogReferencePage, searchReferenceCategory } from "@framer/runner/lib/referenceSearch.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(moduleDir, "../fixtures/assistant-benchmark/pages");

async function main(): Promise<void> {
  const [category, query, queryContains, outputName] = process.argv.slice(2);
  if (!category || !query || !queryContains || !outputName) {
    console.error(
      "Usage: tsx scripts/record-reference-pages.ts <category> <query> <queryContains> <outputName>"
    );
    process.exit(1);
  }

  const search = await searchReferenceCategory(category, query, 3);
  const top = search.results[0];
  if (!top) {
    throw new Error(`No results for "${query}" in category "${category}" — nothing to record`);
  }

  const page = await fetchCatalogReferencePage(top.url);

  const recorded = {
    search: { category, queryContains, results: search.results, sourcesTried: search.sourcesTried, sourcesSkipped: search.sourcesSkipped },
    page,
  };

  const outputPath = path.join(pagesDir, `${outputName}.json`);
  await writeFile(outputPath, JSON.stringify(recorded, null, 2), "utf8");
  console.log(`Recorded: ${outputPath}`);
  console.log(`Top result: ${top.url}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
