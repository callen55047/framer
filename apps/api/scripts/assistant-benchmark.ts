#!/usr/bin/env tsx
/**
 * Runs the Assistant Benchmark against a live inference provider (LM Studio
 * by default — see docs/local-model-benchmarks.md). Spins an isolated,
 * throwaway SQLite DB seeded with a fixed catalog and replays recorded
 * reference pages, so the only live input is the model itself.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(moduleDir, "../fixtures/assistant-benchmark");

async function main(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "framer-assistant-benchmark-"));
  process.env.DATABASE_PATH = path.join(dataDir, "framer.db");
  process.env.RUNNER_ENABLED = "false";
  process.env.FRAMER_SWEEP_ENABLED = "false";

  const { runMigrations } = await import("../src/db/migrate.js");
  const { pool, dbClient } = await import("../src/db/pool.js");
  const { seedAssistantBenchmarkCatalog } = await import("../src/benchmark/seed.js");
  const { setReferenceAdapterForTests } = await import("../src/lib/chatTools.js");
  const { createReplayReferenceAdapter } = await import("../src/benchmark/referenceFixtures.js");
  const { createChatSession, sendChatMessage, getChatProvider } = await import("../src/services/chatService.js");
  const { loadInferenceConfigFromEnv } = await import("@framer/runner/inference/loadConfig.js");
  const { SCENARIOS, MAX_LATENCY_MS } = await import("../src/benchmark/scenarios.js");
  const { runAssistantBenchmark, writeAssistantBenchmarkArtifacts } = await import(
    "../src/benchmark/assistantBenchmark.js"
  );

  await runMigrations();
  await seedAssistantBenchmarkCatalog(dbClient);
  setReferenceAdapterForTests(createReplayReferenceAdapter());

  const samples = Number(process.env.CHAT_EVAL_SAMPLES ?? 3);
  const maxLatencyMs = Number(process.env.BENCHMARK_MAX_LATENCY_MS ?? MAX_LATENCY_MS);
  // Resolves the real provider from env exactly as chat requests do —
  // including the INFERENCE_CHAT_TEMPERATURE fix, so this measures the
  // config that actually ships.
  const provider = getChatProvider();
  const inferenceConfig = loadInferenceConfigFromEnv();

  try {
    const report = await runAssistantBenchmark({
      scenarios: SCENARIOS,
      maxLatencyMs,
      samples,
      provider: inferenceConfig.provider,
      model: inferenceConfig.model,
      baseUrl: inferenceConfig.baseUrl,
      mockMode: false,
      newSession: async () => (await createChatSession("Assistant Benchmark")).id,
      sendTurn: (sessionId, userText) => sendChatMessage(sessionId, userText, provider),
    });

    await writeAssistantBenchmarkArtifacts(fixturesDir, report);

    console.log(`Assistant benchmark: ${report.summary.passed}/${report.summary.total} scenarios passed`);
    console.log(`Gate: ${report.summary.gatePassed ? "PASSED" : "FAILED"}`);
    console.log(`Results: ${path.join(fixturesDir, "benchmark-results.json")}`);
    console.log(`Transcripts (read these for tone): ${path.join(fixturesDir, "last-benchmark.md")}`);

    if (!report.summary.gatePassed) {
      for (const scenario of report.scenarios.filter((s) => !s.passed)) {
        console.log(
          `  FAIL ${scenario.scenarioId} (${Math.round(scenario.passRate * 100)}% pass rate, within budget: ${scenario.withinLatencyBudget})`
        );
      }
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
