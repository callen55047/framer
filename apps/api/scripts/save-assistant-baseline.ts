#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizeBaselineFilename,
  saveAssistantBaselineAndRefreshComparison,
  type AssistantBenchmarkReport,
} from "../src/benchmark/assistantBenchmark.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(moduleDir, "../fixtures/assistant-benchmark");

async function main(): Promise<void> {
  const raw = await readFile(path.join(fixturesDir, "benchmark-results.json"), "utf8");
  const report = JSON.parse(raw) as AssistantBenchmarkReport;
  const notes = process.env.BENCHMARK_NOTES?.trim() || undefined;

  const { record, comparisonPath } = await saveAssistantBaselineAndRefreshComparison(fixturesDir, report, notes);

  console.log(`Saved baseline: ${record.baselineId}`);
  console.log(
    `File: ${path.join(fixturesDir, "baselines", `${sanitizeBaselineFilename(record.baselineId)}.json`)}`
  );
  if (record.notes) {
    console.log(`Notes: ${record.notes}`);
  }
  console.log(`Updated comparison: ${comparisonPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
