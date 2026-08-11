import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPocBenchmark, writeBenchmarkArtifacts } from "../src/benchmark/pocBenchmark.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pocDir = path.resolve(moduleDir, "../fixtures/poc");

async function main(): Promise<void> {
  const report = await runPocBenchmark({ pocDir });
  await writeBenchmarkArtifacts(pocDir, report);

  console.log(`POC benchmark: ${report.summary.passed}/${report.summary.total} passed`);
  console.log(`Gate: ${report.summary.gatePassed ? "PASSED" : "FAILED"}`);
  console.log(`Results: ${path.join(pocDir, "benchmark-results.json")}`);

  if (!report.summary.gatePassed) {
    for (const result of report.results.filter((entry) => !entry.passed)) {
      console.log(
        `  FAIL ${result.fixtureId} (${result.provider}): schema=${result.schemaValid} grounded=${result.grounded} latency=${result.latencyMs}ms error=${result.error ?? ""}`
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
