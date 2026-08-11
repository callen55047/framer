import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runPocBenchmark } from "./pocBenchmark.js";

const pocDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/poc");

describe("runPocBenchmark", () => {
  it("passes the quality gate in mock mode for all curated fixtures", async () => {
    const report = await runPocBenchmark({
      pocDir,
      mock: true,
      providers: ["ollama"],
    });

    expect(report.summary.total).toBe(4);
    expect(report.summary.gatePassed).toBe(true);
    expect(report.results.every((result) => result.schemaValid && result.grounded)).toBe(true);
  });
});
