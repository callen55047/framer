# Local model benchmarks

Framer runs two Benchmarks against a live local model before promoting it — see CONTEXT.md#Work
for the vocabulary. Both are scored, gated on quality and (optionally) latency, and compared
against committed per-model baselines. Neither ever gates `npm test`; both refuse to save a
mock run as a baseline.

- **Extraction Benchmark** — `RefreshListing`'s schema-constrained JSON extraction, over
  recorded page Artifacts.
- **Assistant Benchmark** — the chat assistant's tool routing, research, and tone, over
  scripted Scenarios.

## Extraction Benchmark

### Fixture corpus

- Manifest: [`apps/runner/fixtures/poc/manifest.json`](apps/runner/fixtures/poc/manifest.json)
- HTML fixtures: [`apps/runner/fixtures/poc/`](apps/runner/fixtures/poc/) (4 synthetic retailer pages with verbatim title/price text)
- Baselines: [`apps/runner/fixtures/poc/baselines/`](apps/runner/fixtures/poc/baselines/)
- Comparison table: [`apps/runner/fixtures/poc/baselines/COMPARISON.md`](apps/runner/fixtures/poc/baselines/COMPARISON.md)

### Gates

| Gate | Criteria |
|------|----------|
| **Quality** | Every fixture: schema-valid extraction with grounded `title` and `price`. Mock runs do not qualify. |
| **Full** | Quality gate plus every fixture within the recorded latency budget (`maxLatencyMs`). |

Default latency budget is **60s per fixture** (see manifest). Reasoning-heavy models often fail the full gate while still passing quality. For local-only latency evaluation, override with `BENCHMARK_MAX_LATENCY_MS`.

### Run a benchmark

Configure LM Studio via env vars documented in [`apps/runner/.env.example`](apps/runner/.env.example).

```bash
# From env (defaults to LM Studio serving google/gemma-4-e2b)
LM_STUDIO_MODEL=your-model-id \
npm run benchmark

# Optional: relaxed latency budget for slow local models
BENCHMARK_MAX_LATENCY_MS=300000 npm run benchmark
```

`BENCHMARK_PROVIDERS` still accepts a comma-separated list of `InferenceProviderKind` values (currently just `lmstudio`); it's kept for when a second provider is added.

Ephemeral output (not committed):

- `apps/runner/fixtures/poc/benchmark-results.json`
- `apps/runner/fixtures/poc/last-benchmark.md`

### Save a baseline

Promote the latest benchmark run into the committed baseline registry:

```bash
BENCHMARK_NOTES="reasoning off; Q4 quant; MacBook M3" npm run benchmark:save-baseline
```

This writes `baselines/<provider>__<model>.json` and regenerates `COMPARISON.md`. Mock benchmark runs are rejected.

### Refresh comparison table

After editing baseline JSON by hand or adding files:

```bash
npm run benchmark:compare
```

### Baseline record format

```json
{
  "baselineId": "lmstudio/qwen3.5-9b-deepseek-v4-flash",
  "savedAt": "2026-08-07T17:04:16.485Z",
  "notes": "optional free-text context",
  "report": { /* full BenchmarkReport */ }
}
```

Record `notes` for settings that are not captured automatically (quantization, reasoning on/off, hardware, LM Studio version).

### Current baseline

The first committed baseline is LM Studio `qwen3.5-9b-deepseek-v4-flash`:

- **Quality**: pass (4/4 schema-valid, 4/4 grounded)
- **Full** (60s budget): fail — mean latency ~181s, p95 ~221s
- Reasoning tokens dominate latency on this model

Use [`COMPARISON.md`](apps/runner/fixtures/poc/baselines/COMPARISON.md) when evaluating alternative models on the same corpus.

## Assistant Benchmark

Runs every Scenario in [`apps/api/src/benchmark/scenarios.ts`](apps/api/src/benchmark/scenarios.ts) against `chatService.sendChatMessage` with a live provider, over a fixed seed catalog ([`apps/api/src/benchmark/seed.ts`](apps/api/src/benchmark/seed.ts)) in an isolated, throwaway SQLite DB. Reference page fetches are replayed from recorded fixtures in [`apps/api/fixtures/assistant-benchmark/pages/`](apps/api/fixtures/assistant-benchmark/pages/) rather than hit live — the model is the only live input. Each Scenario is a named, ordered sequence of user turns; each turn declares required/forbidden tool calls, argument predicates, clarification expectations, and reply-text patterns.

### Why sampled, not single-shot

The model is not deterministic at the temperature chat actually runs at (`INFERENCE_CHAT_TEMPERATURE`, default `0.3`). Each Scenario runs `CHAT_EVAL_SAMPLES` times (default 3) and is scored as a **pass rate** — a tool-routing rule that fires one time in three is a broken rule that a single sample would show as green half the time.

### Gates

| Gate | Criteria |
|------|----------|
| **Quality** | Every Scenario at a 100% pass rate across samples. Mock runs do not qualify. |
| **Full** | Quality gate plus every turn within the latency budget (`maxLatencyMs` in `scenarios.ts`, override with `BENCHMARK_MAX_LATENCY_MS`). |

### Run a benchmark

Requires LM Studio (or whatever `INFERENCE_PROVIDER` is configured) reachable at the configured base URL — see [`apps/api/.env.example`](apps/api/.env.example).

```bash
npm run benchmark:assistant

# More or fewer samples per scenario
CHAT_EVAL_SAMPLES=5 npm run benchmark:assistant
```

Ephemeral output (not committed):

- `apps/api/fixtures/assistant-benchmark/benchmark-results.json`
- `apps/api/fixtures/assistant-benchmark/last-benchmark.md` — every transcript (user turn, tool
  calls with arguments, the reply verbatim, and which checks passed). The mechanical checks
  catch mechanical failures; read this file to judge whether the replies are actually any good.

### Save a baseline

```bash
BENCHMARK_NOTES="temperature 0.3; Q4 quant; MacBook M3" npm run benchmark:assistant:save-baseline
```

Writes `apps/api/fixtures/assistant-benchmark/baselines/<provider>__<model>.json` and
regenerates `COMPARISON.md` there. Mock runs are rejected, same as the Extraction Benchmark.

### Recording a new reference page

When a new Scenario needs a research fixture the replay adapter doesn't have yet, record it
once against the live allowlist and commit the result:

```bash
npm run benchmark:assistant:record-pages -- bike_specs \
  "2024 Rocky Mountain Altitude geometry" altitude geometry-geeks-altitude-2024
```

### Harness self-test

`apps/api/src/benchmark/assistantBenchmark.test.ts` runs in `npm test` with a scripted provider
in place of the model — it tests the scorer and pass-rate aggregation, not the model, so it
never needs LM Studio.
