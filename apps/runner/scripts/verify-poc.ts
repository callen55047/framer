import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPocBenchmark, writeBenchmarkArtifacts } from "../src/benchmark/pocBenchmark.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pocDir = path.resolve(moduleDir, "../fixtures/poc");

async function main(): Promise<void> {
  process.env.MOCK_INFERENCE = "1";
  const report = await runPocBenchmark({ pocDir, mock: true, providers: ["ollama"] });
  await writeBenchmarkArtifacts(pocDir, report);

  if (!report.summary.gatePassed) {
    console.error("POC verification failed in mock benchmark gate");
    process.exit(1);
  }

  console.log("POC verification passed (mock benchmark gate)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
