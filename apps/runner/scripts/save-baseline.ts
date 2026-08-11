import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadBenchmarkReport,
  sanitizeBaselineFilename,
  saveBaselineAndRefreshComparison,
} from "../src/benchmark/pocBenchmark.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pocDir = path.resolve(moduleDir, "../fixtures/poc");

async function main(): Promise<void> {
  const report = await loadBenchmarkReport(pocDir);
  const notes = process.env.BENCHMARK_NOTES?.trim() || undefined;

  const { record, comparisonPath } = await saveBaselineAndRefreshComparison(pocDir, report, notes);

  console.log(`Saved baseline: ${record.baselineId}`);
  console.log(`File: ${path.join(pocDir, "baselines", `${sanitizeBaselineFilename(record.baselineId)}.json`)}`);
  if (record.notes) {
    console.log(`Notes: ${record.notes}`);
  }
  console.log(`Updated comparison: ${comparisonPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
