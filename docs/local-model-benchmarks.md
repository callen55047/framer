# Local model benchmarks

Framer benchmarks **Listing extraction** (schema-constrained JSON + grounding) against a fixed POC fixture corpus before promoting a local model for `RefreshListing` jobs.

## Fixture corpus

- Manifest: [`apps/runner/fixtures/poc/manifest.json`](apps/runner/fixtures/poc/manifest.json)
- HTML fixtures: [`apps/runner/fixtures/poc/`](apps/runner/fixtures/poc/) (4 synthetic retailer pages with verbatim title/price text)
- Baselines: [`apps/runner/fixtures/poc/baselines/`](apps/runner/fixtures/poc/baselines/)
- Comparison table: [`apps/runner/fixtures/poc/baselines/COMPARISON.md`](apps/runner/fixtures/poc/baselines/COMPARISON.md)

## Gates

| Gate | Criteria |
|------|----------|
| **Quality** | Every fixture: schema-valid extraction with grounded `title` and `price`. Mock runs do not qualify. |
| **Full** | Quality gate plus every fixture within the recorded latency budget (`maxLatencyMs`). |

Default latency budget is **60s per fixture** (see manifest). Reasoning-heavy models often fail the full gate while still passing quality. For local-only latency evaluation, override with `BENCHMARK_MAX_LATENCY_MS`.

## Run a benchmark

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

## Save a baseline

Promote the latest benchmark run into the committed baseline registry:

```bash
BENCHMARK_NOTES="reasoning off; Q4 quant; MacBook M3" npm run benchmark:save-baseline
```

This writes `baselines/<provider>__<model>.json` and regenerates `COMPARISON.md`. Mock benchmark runs are rejected.

## Refresh comparison table

After editing baseline JSON by hand or adding files:

```bash
npm run benchmark:compare
```

## Baseline record format

```json
{
  "baselineId": "lmstudio/qwen3.5-9b-deepseek-v4-flash",
  "savedAt": "2026-08-07T17:04:16.485Z",
  "notes": "optional free-text context",
  "report": { /* full BenchmarkReport */ }
}
```

Record `notes` for settings that are not captured automatically (quantization, reasoning on/off, hardware, LM Studio version).

## Current baseline

The first committed baseline is LM Studio `qwen3.5-9b-deepseek-v4-flash`:

- **Quality**: pass (4/4 schema-valid, 4/4 grounded)
- **Full** (60s budget): fail — mean latency ~181s, p95 ~221s
- Reasoning tokens dominate latency on this model

Use [`COMPARISON.md`](apps/runner/fixtures/poc/baselines/COMPARISON.md) when evaluating alternative models on the same corpus.
