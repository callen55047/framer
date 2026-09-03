import { describe, expect, it } from "vitest";
import { runAssistantBenchmark, type Scenario } from "./assistantBenchmark.js";
import type { ChatSseEvent } from "../services/chatService.js";

/**
 * Tests the scorer and aggregation, not a real model: `sendTurn` below
 * returns canned SSE event sequences instead of driving chatService/LM
 * Studio. This is the harness self-test — safe in `npm test`, no LM Studio
 * required. See docs/local-model-benchmarks.md.
 */

async function* toolCallThenText(toolName: string, args: Record<string, unknown>, text: string): AsyncIterable<ChatSseEvent> {
  yield { event: "tool-call", data: { messageId: "m1", toolName, toolArgs: args } };
  yield { event: "text-delta", data: { delta: text } };
}

async function* textOnly(text: string): AsyncIterable<ChatSseEvent> {
  yield { event: "text-delta", data: { delta: text } };
}

async function* clarificationOnly(question: string, options: string[]): AsyncIterable<ChatSseEvent> {
  yield { event: "clarification", data: { messageId: "m2", question, options, allowFreeText: false } };
}

const GOOD_SCENARIO: Scenario = {
  id: "good",
  description: "always calls the right tool and answers on-pattern",
  turns: [{ user: "how much", expect: { requireTools: ["listWatches"], mustMatch: [/ok/] } }],
};

const BAD_SCENARIO: Scenario = {
  id: "bad",
  description: "never calls the required tool",
  turns: [{ user: "nope", expect: { requireTools: ["listWatches"] } }],
};

const CLARIFICATION_SCENARIO: Scenario = {
  id: "clarifies",
  description: "ends with a clarification carrying 2-4 options",
  turns: [{ user: "stem", expect: { endsWithClarification: true, clarificationOptionsRange: [2, 4] } }],
};

describe("assistantBenchmark scorer", () => {
  it("passes a scenario whose every sample satisfies its expectations", async () => {
    const report = await runAssistantBenchmark({
      scenarios: [GOOD_SCENARIO],
      maxLatencyMs: 60000,
      samples: 2,
      provider: "mock",
      model: "mock-model",
      baseUrl: "mock://",
      mockMode: true,
      newSession: async () => "session",
      sendTurn: () => toolCallThenText("listWatches", {}, "ok, all good"),
    });

    const result = report.scenarios[0]!;
    expect(result.passRate).toBe(1);
    expect(result.passed).toBe(true);
  });

  it("fails a scenario whose required tool never gets called", async () => {
    const report = await runAssistantBenchmark({
      scenarios: [BAD_SCENARIO],
      maxLatencyMs: 60000,
      samples: 2,
      provider: "mock",
      model: "mock-model",
      baseUrl: "mock://",
      mockMode: true,
      newSession: async () => "session",
      sendTurn: () => textOnly("no lookups here"),
    });

    const result = report.scenarios[0]!;
    expect(result.passRate).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.samples[0]!.turns[0]!.checks.find((c) => c.name === "calls listWatches")?.passed).toBe(false);
  });

  it("reports a fractional pass rate when only some samples pass", async () => {
    let call = 0;
    const report = await runAssistantBenchmark({
      scenarios: [BAD_SCENARIO],
      maxLatencyMs: 60000,
      samples: 2,
      provider: "mock",
      model: "mock-model",
      baseUrl: "mock://",
      mockMode: true,
      newSession: async () => "session",
      sendTurn: () => {
        call += 1;
        return call % 2 === 1 ? toolCallThenText("listWatches", {}, "ok") : textOnly("no lookup");
      },
    });

    const result = report.scenarios[0]!;
    expect(result.passRate).toBe(0.5);
    expect(result.passed).toBe(false);
  });

  it("scores a clarification turn on option count, not reply text", async () => {
    const report = await runAssistantBenchmark({
      scenarios: [CLARIFICATION_SCENARIO],
      maxLatencyMs: 60000,
      samples: 1,
      provider: "mock",
      model: "mock-model",
      baseUrl: "mock://",
      mockMode: true,
      newSession: async () => "session",
      sendTurn: () => clarificationOnly("Handlebar stem or valve stem?", ["Handlebar stem", "Valve stem"]),
    });

    expect(report.scenarios[0]!.passed).toBe(true);
  });

  it("report.summary.gatePassed mirrors the extraction benchmark's gate: mock mode is not disqualifying here", async () => {
    // Mock-run disqualification is enforced at saveAssistantBaseline time
    // (throws on report.mockMode), matching runPocBenchmark/saveBaseline.
    const report = await runAssistantBenchmark({
      scenarios: [GOOD_SCENARIO],
      maxLatencyMs: 60000,
      samples: 1,
      provider: "mock",
      model: "mock-model",
      baseUrl: "mock://",
      mockMode: true,
      newSession: async () => "session",
      sendTurn: () => toolCallThenText("listWatches", {}, "ok"),
    });

    expect(report.summary.gatePassed).toBe(true);
  });

  it("a scenario over the latency budget fails the scenario and the report gate, but still counts toward quality pass rate", async () => {
    const report = await runAssistantBenchmark({
      scenarios: [GOOD_SCENARIO],
      maxLatencyMs: -1,
      samples: 1,
      provider: "lmstudio",
      model: "google/gemma-4-e2b",
      baseUrl: "http://localhost:1234/v1",
      mockMode: false,
      newSession: async () => "session",
      sendTurn: () => toolCallThenText("listWatches", {}, "ok"),
    });

    expect(report.scenarios[0]!.passRate).toBe(1);
    expect(report.scenarios[0]!.withinLatencyBudget).toBe(false);
    expect(report.scenarios[0]!.passed).toBe(false); // passRate alone isn't enough — latency matters too
    expect(report.summary.gatePassed).toBe(false);
  });
});
