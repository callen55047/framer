import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllBaselines, writeComparisonMarkdown } from "../src/benchmark/pocBenchmark.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pocDir = path.resolve(moduleDir, "../fixtures/poc");

async function main(): Promise<void> {
  const baselines = await loadAllBaselines(pocDir);
  const comparisonPath = await writeComparisonMarkdown(pocDir);

  console.log(`Compared ${baselines.length} baseline(s)`);
  console.log(`Updated: ${comparisonPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
