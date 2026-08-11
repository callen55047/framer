import { describe, expect, it } from "vitest";
import type { BaselineRecord, BenchmarkReport } from "./pocBenchmark.js";
import {
  buildComparisonMarkdown,
  deriveBaselineId,
  sanitizeBaselineFilename,
  summarizeBaselineGates,
} from "./pocBenchmark.js";

function sampleReport(overrides: Partial<BenchmarkReport> = {}): BenchmarkReport {
  return {
    generatedAt: "2026-08-07T12:00:00.000Z",
    mockMode: false,
    maxLatencyMs: 60000,
    providers: ["lmstudio"],
    results: [
      {
        fixtureId: "jenson-wheel",
        provider: "lmstudio",
        model: "qwen3.5-9b-deepseek-v4-flash",
        baseUrl: "http://localhost:1234/v1",
        schemaValid: true,
        grounded: true,
        groundedFields: ["title", "price"],
        ungroundedFields: [],
        latencyMs: 100000,
        withinLatencyBudget: false,
        passed: false,
      },
      {
        fixtureId: "rei-frame",
        provider: "lmstudio",
        model: "qwen3.5-9b-deepseek-v4-flash",
        baseUrl: "http://localhost:1234/v1",
        schemaValid: true,
        grounded: true,
        groundedFields: ["title", "price"],
        ungroundedFields: [],
        latencyMs: 200000,
        withinLatencyBudget: false,
        passed: false,
      },
    ],
    summary: { total: 2, passed: 0, failed: 2, gatePassed: false },
    ...overrides,
  };
}

describe("baseline helpers", () => {
  it("sanitizes baseline IDs into stable filenames", () => {
    expect(sanitizeBaselineFilename("lmstudio/qwen3.5-9b-deepseek-v4-flash")).toBe(
      "lmstudio__qwen3.5-9b-deepseek-v4-flash"
    );
    expect(sanitizeBaselineFilename("ollama/llama3.2:latest")).toBe("ollama__llama3.2__latest");
  });

  it("derives baseline ID from first result", () => {
    const report = sampleReport();
    expect(deriveBaselineId(report)).toBe("lmstudio/qwen3.5-9b-deepseek-v4-flash");
  });

  it("summarizes quality vs full gates", () => {
    const gates = summarizeBaselineGates(sampleReport());
    expect(gates.qualityPass).toBe(true);
    expect(gates.fullPass).toBe(false);
    expect(gates.meanLatencyMs).toBe(150000);
    expect(gates.p95LatencyMs).toBe(200000);
    expect(gates.fixtureLatenciesMs).toEqual({
      "jenson-wheel": 100000,
      "rei-frame": 200000,
    });
  });

  it("rejects mock runs for quality gate", () => {
    const gates = summarizeBaselineGates(sampleReport({ mockMode: true }));
    expect(gates.qualityPass).toBe(false);
  });

  it("builds comparison markdown with gate columns", () => {
    const baseline: BaselineRecord = {
      baselineId: "lmstudio/qwen3.5-9b-deepseek-v4-flash",
      savedAt: "2026-08-07T17:04:16.485Z",
      notes: "reasoning enabled",
      report: sampleReport(),
    };

    const markdown = buildComparisonMarkdown([baseline]);
    expect(markdown).toContain("lmstudio / qwen3.5-9b-deepseek-v4-flash");
    expect(markdown).toContain("| true | false |");
    expect(markdown).toContain("reasoning enabled");
    expect(markdown).toContain("Quality pass");
  });
});
