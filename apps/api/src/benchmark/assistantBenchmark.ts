import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatSseEvent } from "../services/chatService.js";

/**
 * The Assistant Benchmark: a scored run of the live model over a fixed
 * corpus of Scenarios (see scenarios.ts), sibling to the Extraction
 * Benchmark in apps/runner/src/benchmark/pocBenchmark.ts. See
 * docs/local-model-benchmarks.md.
 * TODO: all tests currently fail. need to improve
 */

export interface ToolArgExpectation {
  tool: string;
  description: string;
  predicate: (args: Record<string, unknown>) => boolean;
}

export interface ScenarioTurnExpect {
  /** Tools that must appear somewhere in this turn's tool calls. */
  requireTools?: string[];
  /** Tools that must not appear in this turn's tool calls. */
  forbidTools?: string[];
  /** Argument-level checks on whichever call(s) matched `tool`. */
  toolArgs?: ToolArgExpectation[];
  /** Turn must end by calling askClarifyingQuestion. */
  endsWithClarification?: boolean;
  /** Bounds on the number of clarification options, when endsWithClarification is set. */
  clarificationOptionsRange?: [number, number];
  /** Patterns the reply text must contain. Ignored on a clarification turn. */
  mustMatch?: RegExp[];
  /** Patterns the reply text must not contain (forbidden phrasing, UUIDs, ...). */
  mustNotMatch?: RegExp[];
  /** Reply length cap, for the tone requirement that answers stay clipped. */
  maxChars?: number;
}

export interface ScenarioTurn {
  user: string;
  expect: ScenarioTurnExpect;
}

export interface Scenario {
  id: string;
  description: string;
  turns: ScenarioTurn[];
}

export interface AssistantManifest {
  version: number;
  description?: string;
  maxLatencyMs: number;
  scenarios: Scenario[];
}

export interface TurnCheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface TurnResult {
  turnIndex: number;
  userText: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  clarification: { question: string; options?: string[] } | null;
  replyText: string;
  latencyMs: number;
  checks: TurnCheckResult[];
  passed: boolean;
}

export interface SampleResult {
  sampleIndex: number;
  turns: TurnResult[];
  passed: boolean;
}

export interface ScenarioResult {
  scenarioId: string;
  description: string;
  samples: SampleResult[];
  /** Fraction of samples where every turn's checks passed. */
  passRate: number;
  withinLatencyBudget: boolean;
  /** passRate === 1 AND within the latency budget — the "full pass" bar for one Scenario. */
  passed: boolean;
}

export interface AssistantBenchmarkReport {
  generatedAt: string;
  mockMode: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  samples: number;
  maxLatencyMs: number;
  scenarios: ScenarioResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    gatePassed: boolean;
  };
}

export interface AssistantBaselineRecord {
  baselineId: string;
  savedAt: string;
  notes?: string;
  report: AssistantBenchmarkReport;
}

export interface AssistantBaselineGateSummary {
  qualityPass: boolean;
  fullPass: boolean;
  meanPassRate: number;
  scenarioPassRates: Record<string, number>;
}

/** Consumes one turn's SSE stream and reduces it to the shape scoring needs. */
async function collectTurn(
  turnIndex: number,
  userText: string,
  events: AsyncIterable<ChatSseEvent>
): Promise<Omit<TurnResult, "checks" | "passed">> {
  const start = Date.now();
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let clarification: { question: string; options?: string[] } | null = null;
  let replyText = "";

  for await (const event of events) {
    if (event.event === "tool-call") {
      toolCalls.push({ name: event.data.toolName, args: event.data.toolArgs });
    } else if (event.event === "clarification") {
      clarification = { question: event.data.question, options: event.data.options };
    } else if (event.event === "text-delta") {
      replyText += event.data.delta;
    } else if (event.event === "error") {
      throw new Error(`chat turn errored: ${event.data.error}`);
    }
  }

  return {
    turnIndex,
    userText,
    toolCalls,
    clarification,
    replyText,
    latencyMs: Date.now() - start,
  };
}

/** Scores one collected turn against its Scenario expectations. */
function scoreTurn(turn: Omit<TurnResult, "checks" | "passed">, expect: ScenarioTurnExpect): TurnResult {
  const checks: TurnCheckResult[] = [];
  const toolNames = turn.toolCalls.map((call) => call.name);

  for (const required of expect.requireTools ?? []) {
    checks.push({
      name: `calls ${required}`,
      passed: toolNames.includes(required),
      detail: toolNames.includes(required) ? undefined : `tool calls were: ${toolNames.join(", ") || "(none)"}`,
    });
  }

  for (const forbidden of expect.forbidTools ?? []) {
    checks.push({
      name: `does not call ${forbidden}`,
      passed: !toolNames.includes(forbidden),
    });
  }

  for (const argCheck of expect.toolArgs ?? []) {
    const calls = turn.toolCalls.filter((call) => call.name === argCheck.tool);
    const ok = calls.length > 0 && calls.some((call) => argCheck.predicate(call.args));
    checks.push({
      name: `${argCheck.tool} ${argCheck.description}`,
      passed: ok,
      detail: ok ? undefined : `args seen: ${JSON.stringify(calls.map((call) => call.args))}`,
    });
  }

  if (expect.endsWithClarification) {
    checks.push({ name: "ends with a clarification", passed: turn.clarification !== null });
    if (turn.clarification && expect.clarificationOptionsRange) {
      const [min, max] = expect.clarificationOptionsRange;
      const count = turn.clarification.options?.length ?? 0;
      checks.push({
        name: `clarification has ${min}-${max} options`,
        passed: count >= min && count <= max,
        detail: `got ${count}`,
      });
    }
  } else {
    for (const pattern of expect.mustMatch ?? []) {
      checks.push({
        name: `reply matches ${pattern}`,
        passed: pattern.test(turn.replyText),
      });
    }
  }

  for (const pattern of expect.mustNotMatch ?? []) {
    checks.push({
      name: `reply does not match ${pattern}`,
      passed: !pattern.test(turn.replyText),
    });
  }

  if (expect.maxChars !== undefined) {
    checks.push({
      name: `reply under ${expect.maxChars} chars`,
      passed: turn.replyText.length <= expect.maxChars,
      detail: `got ${turn.replyText.length}`,
    });
  }

  return { ...turn, checks, passed: checks.every((check) => check.passed) };
}

/**
 * Runs every Scenario `samples` times and scores each turn. `sendTurn` drives
 * one turn of a real (or mock) provider through `sendChatMessage`; `newSession`
 * creates a fresh Assistant Session per (scenario, sample) so samples never
 * see each other's history.
 */
export async function runAssistantBenchmark(options: {
  scenarios: Scenario[];
  maxLatencyMs: number;
  samples: number;
  provider: string;
  model: string;
  baseUrl: string;
  mockMode: boolean;
  newSession: () => Promise<string>;
  sendTurn: (sessionId: string, userText: string) => AsyncIterable<ChatSseEvent>;
}): Promise<AssistantBenchmarkReport> {
  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of options.scenarios) {
    const samples: SampleResult[] = [];

    for (let sampleIndex = 0; sampleIndex < options.samples; sampleIndex++) {
      const sessionId = await options.newSession();
      const turns: TurnResult[] = [];

      for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex++) {
        const scenarioTurn = scenario.turns[turnIndex]!;
        const collected = await collectTurn(turnIndex, scenarioTurn.user, options.sendTurn(sessionId, scenarioTurn.user));
        turns.push(scoreTurn(collected, scenarioTurn.expect));
      }

      samples.push({ sampleIndex, turns, passed: turns.every((turn) => turn.passed) });
    }

    const passRate = samples.filter((sample) => sample.passed).length / samples.length;
    const withinLatencyBudget = samples.every((sample) =>
      sample.turns.every((turn) => turn.latencyMs <= options.maxLatencyMs)
    );

    scenarioResults.push({
      scenarioId: scenario.id,
      description: scenario.description,
      samples,
      passRate,
      withinLatencyBudget,
      passed: passRate === 1 && withinLatencyBudget,
    });
  }

  const passedCount = scenarioResults.filter((result) => result.passed).length;

  return {
    generatedAt: new Date().toISOString(),
    mockMode: options.mockMode,
    provider: options.provider,
    model: options.model,
    baseUrl: options.baseUrl,
    samples: options.samples,
    maxLatencyMs: options.maxLatencyMs,
    scenarios: scenarioResults,
    summary: {
      total: scenarioResults.length,
      passed: passedCount,
      failed: scenarioResults.length - passedCount,
      // Mirrors runPocBenchmark: mock-mode disqualification is enforced only
      // at saveAssistantBaseline time, not baked into this report's gate.
      gatePassed: passedCount === scenarioResults.length && scenarioResults.length > 0,
    },
  };
}

export function deriveBaselineId(report: AssistantBenchmarkReport): string {
  return `${report.provider}/${report.model}`;
}

export function sanitizeBaselineFilename(baselineId: string): string {
  return baselineId.replace(/[/\\:]+/g, "__").replace(/\s+/g, "_");
}

export function baselinesDir(fixturesDir: string): string {
  return path.join(fixturesDir, "baselines");
}

export function summarizeAssistantBaselineGates(report: AssistantBenchmarkReport): AssistantBaselineGateSummary {
  const scenarioPassRates: Record<string, number> = {};
  for (const scenario of report.scenarios) {
    scenarioPassRates[scenario.scenarioId] = scenario.passRate;
  }

  const qualityPass =
    !report.mockMode && report.scenarios.length > 0 && report.scenarios.every((s) => s.passRate === 1);
  const fullPass = qualityPass && report.scenarios.every((s) => s.withinLatencyBudget);
  const rates = Object.values(scenarioPassRates);
  const meanPassRate = rates.length === 0 ? 0 : rates.reduce((sum, r) => sum + r, 0) / rates.length;

  return { qualityPass, fullPass, meanPassRate, scenarioPassRates };
}

export async function saveAssistantBaseline(
  fixturesDir: string,
  report: AssistantBenchmarkReport,
  notes?: string
): Promise<AssistantBaselineRecord> {
  if (report.mockMode) {
    throw new Error("Refusing to save mock Assistant Benchmark run as a baseline");
  }

  const baselineId = deriveBaselineId(report);
  const record: AssistantBaselineRecord = {
    baselineId,
    savedAt: new Date().toISOString(),
    notes: notes?.trim() || undefined,
    report,
  };

  const dir = baselinesDir(fixturesDir);
  const filePath = path.join(dir, `${sanitizeBaselineFilename(baselineId)}.json`);
  await writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function loadAllAssistantBaselines(fixturesDir: string): Promise<AssistantBaselineRecord[]> {
  const dir = baselinesDir(fixturesDir);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const baselines: AssistantBaselineRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const raw = await readFile(path.join(dir, entry), "utf8");
    baselines.push(JSON.parse(raw) as AssistantBaselineRecord);
  }
  return baselines;
}

export function buildAssistantComparisonMarkdown(baselines: AssistantBaselineRecord[]): string {
  const sorted = [...baselines].sort((a, b) => a.baselineId.localeCompare(b.baselineId));
  const lines = [
    "# Assistant benchmark comparison",
    "",
    "Auto-generated from committed baseline files in this directory.",
    "",
    "| baseline | saved | samples | quality pass | full pass | mean pass rate | notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const baseline of sorted) {
    const gates = summarizeAssistantBaselineGates(baseline.report);
    const notes = (baseline.notes ?? "").replace(/\|/g, "\\|");
    lines.push(
      `| ${baseline.baselineId} | ${baseline.savedAt.slice(0, 10)} | ${baseline.report.samples} | ${gates.qualityPass} | ${gates.fullPass} | ${gates.meanPassRate.toFixed(2)} | ${notes} |`
    );
  }

  lines.push("");
  lines.push("## Gate definitions");
  lines.push("");
  lines.push("- **Quality pass**: every Scenario at a 100% pass rate across samples (mock runs excluded).");
  lines.push("- **Full pass**: quality pass plus every turn within the latency budget.");
  lines.push("");
  lines.push("See [docs/local-model-benchmarks.md](../../../../docs/local-model-benchmarks.md).");

  return lines.join("\n");
}

export async function writeAssistantComparisonMarkdown(fixturesDir: string): Promise<string> {
  const baselines = await loadAllAssistantBaselines(fixturesDir);
  const markdown = buildAssistantComparisonMarkdown(baselines);
  const mdPath = path.join(baselinesDir(fixturesDir), "COMPARISON.md");
  await writeFile(mdPath, markdown, "utf8");
  return mdPath;
}

export async function saveAssistantBaselineAndRefreshComparison(
  fixturesDir: string,
  report: AssistantBenchmarkReport,
  notes?: string
): Promise<{ record: AssistantBaselineRecord; comparisonPath: string }> {
  const record = await saveAssistantBaseline(fixturesDir, report, notes);
  const comparisonPath = await writeAssistantComparisonMarkdown(fixturesDir);
  return { record, comparisonPath };
}

/** Renders every transcript for human tone review — the point of `last-benchmark.md`. */
export function renderAssistantBenchmarkMarkdown(report: AssistantBenchmarkReport): string {
  const lines = [
    "# Assistant benchmark — last run",
    "",
    `Generated ${report.generatedAt} · provider ${report.provider} · model ${report.model} · ${report.samples} samples/scenario${report.mockMode ? " · MOCK MODE" : ""}`,
    "",
    `**Gate**: ${report.summary.gatePassed ? "PASS" : "FAIL"} (${report.summary.passed}/${report.summary.total} scenarios at 100% pass rate)`,
    "",
  ];

  for (const scenario of report.scenarios) {
    lines.push(`## ${scenario.scenarioId} — ${scenario.passed ? "PASS" : "FAIL"} (${Math.round(scenario.passRate * 100)}%)`);
    lines.push("");
    lines.push(scenario.description);
    lines.push("");
    for (const sample of scenario.samples) {
      lines.push(`### sample ${sample.sampleIndex} — ${sample.passed ? "pass" : "fail"}`);
      for (const turn of sample.turns) {
        lines.push("");
        lines.push(`**user:** ${turn.userText}`);
        for (const call of turn.toolCalls) {
          lines.push(`- tool call: \`${call.name}\`(${JSON.stringify(call.args)})`);
        }
        if (turn.clarification) {
          lines.push(`**clarification:** ${turn.clarification.question} [${(turn.clarification.options ?? []).join(" / ")}]`);
        } else {
          lines.push(`**assistant:** ${turn.replyText}`);
        }
        lines.push(`_latency: ${turn.latencyMs}ms_`);
        for (const check of turn.checks) {
          lines.push(`  - [${check.passed ? "x" : " "}] ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function writeAssistantBenchmarkArtifacts(fixturesDir: string, report: AssistantBenchmarkReport): Promise<void> {
  await writeFile(path.join(fixturesDir, "benchmark-results.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(path.join(fixturesDir, "last-benchmark.md"), renderAssistantBenchmarkMarkdown(report), "utf8");
}
