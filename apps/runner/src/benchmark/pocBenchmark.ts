import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { groundExtraction, ListingExtractionSchema, type ListingExtraction } from "@framer/schema";
import { createInferenceProvider } from "../inference/createProvider.js";
import { loadInferenceConfigFromEnv } from "../inference/loadConfig.js";
import { INFERENCE_PROVIDER_KINDS, type InferenceConfig, type InferenceProviderKind } from "../inference/types.js";
import { extractVisibleText, truncateForPrompt } from "../lib/html.js";

export interface PocFixture {
  id: string;
  retailer: string;
  domain: string;
  url: string;
  fixturePath: string;
  capturedAt: string;
  expected: {
    title: string;
    price: number;
    currency: string;
    inStock: boolean;
  };
}

export interface PocManifest {
  version: number;
  description?: string;
  maxLatencyMs: number;
  fixtures: PocFixture[];
}

export interface BenchmarkCaseResult {
  fixtureId: string;
  provider: InferenceProviderKind;
  model: string;
  baseUrl: string;
  schemaValid: boolean;
  grounded: boolean;
  groundedFields: string[];
  ungroundedFields: string[];
  latencyMs: number;
  withinLatencyBudget: boolean;
  passed: boolean;
  error?: string;
  extraction?: ListingExtraction;
}

export interface BenchmarkReport {
  generatedAt: string;
  mockMode: boolean;
  maxLatencyMs: number;
  providers: InferenceProviderKind[];
  results: BenchmarkCaseResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    gatePassed: boolean;
  };
}

export interface BaselineRecord {
  baselineId: string;
  savedAt: string;
  notes?: string;
  report: BenchmarkReport;
}

export interface BaselineGateSummary {
  qualityPass: boolean;
  fullPass: boolean;
  meanLatencyMs: number;
  p95LatencyMs: number;
  fixtureLatenciesMs: Record<string, number>;
}

export function deriveBaselineId(report: BenchmarkReport): string {
  const first = report.results[0];
  if (!first) {
    throw new Error("Benchmark report has no results; cannot derive baseline ID");
  }
  return `${first.provider}/${first.model}`;
}

/** Sanitize `{provider}/{model}` into a stable filename stem. */
export function sanitizeBaselineFilename(baselineId: string): string {
  return baselineId.replace(/[/\\:]+/g, "__").replace(/\s+/g, "_");
}

export function baselinesDir(pocDir: string): string {
  return path.join(pocDir, "baselines");
}

export function summarizeBaselineGates(report: BenchmarkReport): BaselineGateSummary {
  const latencies = report.results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const fixtureLatenciesMs: Record<string, number> = {};
  for (const result of report.results) {
    fixtureLatenciesMs[result.fixtureId] = result.latencyMs;
  }

  const qualityPass =
    !report.mockMode &&
    report.results.length > 0 &&
    report.results.every((result) => result.schemaValid && result.grounded && !result.error);

  const fullPass =
    qualityPass && report.results.every((result) => result.withinLatencyBudget && result.passed);

  const meanLatencyMs =
    latencies.length === 0 ? 0 : Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);

  const p95Index = latencies.length === 0 ? 0 : Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1);
  const p95LatencyMs = latencies[p95Index] ?? 0;

  return { qualityPass, fullPass, meanLatencyMs, p95LatencyMs, fixtureLatenciesMs };
}

export function buildComparisonMarkdown(baselines: BaselineRecord[]): string {
  const sorted = [...baselines].sort((a, b) => a.baselineId.localeCompare(b.baselineId));
  const lines = [
    "# Local model benchmark comparison",
    "",
    "Auto-generated from committed baseline files in this directory. Regenerate with `npm run benchmark:compare`.",
    "",
    "| baseline | saved | latency budget ms | quality pass | full pass | mean latency ms | p95 latency ms | fixture latencies ms | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const baseline of sorted) {
    const gates = summarizeBaselineGates(baseline.report);
    const latencyParts = Object.entries(gates.fixtureLatenciesMs)
      .map(([fixtureId, latencyMs]) => `${fixtureId}:${latencyMs}`)
      .join(", ");
    const notes = (baseline.notes ?? "").replace(/\|/g, "\\|");
    const first = baseline.report.results[0];
    const providerModel = first ? `${first.provider} / ${first.model}` : baseline.baselineId;

    lines.push(
      `| ${providerModel} | ${baseline.savedAt.slice(0, 10)} | ${baseline.report.maxLatencyMs} | ${gates.qualityPass} | ${gates.fullPass} | ${gates.meanLatencyMs} | ${gates.p95LatencyMs} | ${latencyParts} | ${notes} |`
    );
  }

  lines.push("");
  lines.push("## Gate definitions");
  lines.push("");
  lines.push("- **Quality pass**: every fixture schema-valid with grounded `title` and `price` (mock runs excluded).");
  lines.push("- **Full pass**: quality pass plus every fixture within the recorded latency budget.");
  lines.push("");
  lines.push("See [docs/local-model-benchmarks.md](../../../../docs/local-model-benchmarks.md) for how to run and save baselines.");

  return lines.join("\n");
}

export async function loadBenchmarkReport(pocDir: string): Promise<BenchmarkReport> {
  const jsonPath = path.join(pocDir, "benchmark-results.json");
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw) as BenchmarkReport;
}

export async function loadAllBaselines(pocDir: string): Promise<BaselineRecord[]> {
  const dir = baselinesDir(pocDir);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const baselines: BaselineRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const raw = await readFile(path.join(dir, entry), "utf8");
    baselines.push(JSON.parse(raw) as BaselineRecord);
  }
  return baselines;
}

export async function saveBaseline(
  pocDir: string,
  report: BenchmarkReport,
  notes?: string
): Promise<BaselineRecord> {
  if (report.mockMode) {
    throw new Error("Refusing to save mock benchmark as baseline");
  }

  const baselineId = deriveBaselineId(report);
  const record: BaselineRecord = {
    baselineId,
    savedAt: new Date().toISOString(),
    notes: notes?.trim() || undefined,
    report,
  };

  const dir = baselinesDir(pocDir);
  const filePath = path.join(dir, `${sanitizeBaselineFilename(baselineId)}.json`);
  await writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function writeComparisonMarkdown(pocDir: string): Promise<string> {
  const baselines = await loadAllBaselines(pocDir);
  const markdown = buildComparisonMarkdown(baselines);
  const mdPath = path.join(baselinesDir(pocDir), "COMPARISON.md");
  await writeFile(mdPath, markdown, "utf8");
  return mdPath;
}

export async function saveBaselineAndRefreshComparison(
  pocDir: string,
  report: BenchmarkReport,
  notes?: string
): Promise<{ record: BaselineRecord; comparisonPath: string }> {
  const record = await saveBaseline(pocDir, report, notes);
  const comparisonPath = await writeComparisonMarkdown(pocDir);
  return { record, comparisonPath };
}

export function configForProvider(kind: InferenceProviderKind): InferenceConfig {
  process.env.INFERENCE_PROVIDER = kind;
  delete process.env.INFERENCE_BASE_URL;
  delete process.env.INFERENCE_MODEL;
  return loadInferenceConfigFromEnv();
}

export function parseBenchmarkProviders(raw: string | undefined): InferenceProviderKind[] {
  if (!raw) {
    return [loadInferenceConfigFromEnv().provider];
  }
  const kinds = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const kind of kinds) {
    if (!(INFERENCE_PROVIDER_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`Invalid provider in BENCHMARK_PROVIDERS: ${kind}`);
    }
  }
  return kinds as InferenceProviderKind[];
}

export function createMockProvider(fixtures: PocFixture[]): ReturnType<typeof createInferenceProvider> {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture.expected]));

  return {
    kind: "ollama",
    async extractListing(_pageText: string): Promise<ListingExtraction> {
      const fixtureId = process.env.BENCHMARK_MOCK_FIXTURE_ID;
      const expected = fixtureId ? byId.get(fixtureId) : undefined;
      if (!expected) {
        throw new Error("mock provider missing BENCHMARK_MOCK_FIXTURE_ID");
      }
      return ListingExtractionSchema.parse({
        title: expected.title,
        price: expected.price,
        currency: expected.currency,
        inStock: expected.inStock,
        brand: null,
        modelYear: null,
      });
    },
    async classifyListingRelevance() {
      return { supported: true, reason: "mtb_related" as const };
    },
    async generateWatchTitle(input) {
      return `${input.domain} — ${input.listingTitle}`.slice(0, 120);
    },
    async generateSessionTitle(userMessage: string) {
      return userMessage.slice(0, 60);
    },
    async summarizeChatSession(messages) {
      return messages.map((message) => message.content).join(" ").slice(0, 200);
    },
    async *chat() {
      yield { type: "done" as const };
    },
  };
}

export async function loadPocManifest(manifestPath: string): Promise<PocManifest> {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as PocManifest;
}

export async function runPocBenchmark(options: {
  pocDir: string;
  mock?: boolean;
  providers?: InferenceProviderKind[];
  manifestPath?: string;
}): Promise<BenchmarkReport> {
  const manifestPath = options.manifestPath ?? path.join(options.pocDir, "manifest.json");
  const manifest = await loadPocManifest(manifestPath);
  const maxLatencyOverride = process.env.BENCHMARK_MAX_LATENCY_MS
    ? Number(process.env.BENCHMARK_MAX_LATENCY_MS)
    : undefined;
  const effectiveMaxLatencyMs = maxLatencyOverride ?? manifest.maxLatencyMs;
  const mockMode = options.mock ?? process.env.MOCK_INFERENCE === "1";
  const providers = options.providers ?? parseBenchmarkProviders(process.env.BENCHMARK_PROVIDERS);
  const results: BenchmarkCaseResult[] = [];

  for (const providerKind of providers) {
    const providerConfig = configForProvider(providerKind);
    const provider = mockMode
      ? createMockProvider(manifest.fixtures)
      : createInferenceProvider(providerConfig);

    for (const fixture of manifest.fixtures) {
      const htmlPath = path.join(options.pocDir, fixture.fixturePath);
      const html = await readFile(htmlPath, "utf8");
      const text = extractVisibleText(html);
      const promptText = truncateForPrompt(text);

      const started = performance.now();
      let schemaValid = false;
      let grounded = false;
      let groundedFields: string[] = [];
      let ungroundedFields: string[] = [];
      let extraction: ListingExtraction | undefined;
      let error: string | undefined;

      try {
        if (mockMode) {
          process.env.BENCHMARK_MOCK_FIXTURE_ID = fixture.id;
        }
        extraction = await provider.extractListing(promptText);
        ListingExtractionSchema.parse(extraction);
        schemaValid = true;
        const grounding = groundExtraction(extraction, text);
        grounded = grounding.grounded;
        groundedFields = grounding.groundedFields;
        ungroundedFields = grounding.ungroundedFields;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        if (mockMode) {
          delete process.env.BENCHMARK_MOCK_FIXTURE_ID;
        }
      }

      const latencyMs = Math.round(performance.now() - started);
      const withinLatencyBudget = latencyMs <= effectiveMaxLatencyMs;
      const passed = schemaValid && grounded && withinLatencyBudget && !error;

      results.push({
        fixtureId: fixture.id,
        provider: providerKind,
        model: providerConfig.model,
        baseUrl: providerConfig.baseUrl,
        schemaValid,
        grounded,
        groundedFields,
        ungroundedFields,
        latencyMs,
        withinLatencyBudget,
        passed,
        error,
        extraction,
      });
    }
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const gatePassed = failed === 0 && results.length > 0;

  return {
    generatedAt: new Date().toISOString(),
    mockMode,
    maxLatencyMs: effectiveMaxLatencyMs,
    providers,
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      gatePassed,
    },
  };
}

export async function writeBenchmarkArtifacts(pocDir: string, report: BenchmarkReport): Promise<void> {
  const jsonPath = path.join(pocDir, "benchmark-results.json");
  const mdPath = path.join(pocDir, "last-benchmark.md");

  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    "# POC benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    `Mock mode: ${report.mockMode}`,
    `Latency budget: ${report.maxLatencyMs} ms`,
    `Gate passed: ${report.summary.gatePassed ? "yes" : "no"}`,
    "",
    "| fixture | provider | model | schema | grounded | latency ms | pass |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const result of report.results) {
    lines.push(
      `| ${result.fixtureId} | ${result.provider} | ${result.model} | ${result.schemaValid} | ${result.grounded} | ${result.latencyMs} | ${result.passed} |`
    );
    if (result.error) {
      lines.push(`| | error: ${result.error.replace(/\|/g, "\\|")} | | | | | |`);
    }
  }

  await writeFile(mdPath, lines.join("\n"), "utf8");
}
