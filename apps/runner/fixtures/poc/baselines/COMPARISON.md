# Local model benchmark comparison

Auto-generated from committed baseline files in this directory. Regenerate with `npm run benchmark:compare`.

| baseline | saved | latency budget ms | quality pass | full pass | mean latency ms | p95 latency ms | fixture latencies ms | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lmstudio / qwen3.5-9b-deepseek-v4-flash | 2026-08-07 | 60000 | true | false | 186130 | 220938 | jenson-wheel:220938, competitive-fork:119087, rei-frame:208806, worldwide-pedals:195690 | LM Studio local server; reasoning enabled; quality gate pass; full gate fail at 60s latency budget |

## Gate definitions

- **Quality pass**: every fixture schema-valid with grounded `title` and `price` (mock runs excluded).
- **Full pass**: quality pass plus every fixture within the recorded latency budget.

See [docs/local-model-benchmarks.md](../../../../docs/local-model-benchmarks.md) for how to run and save baselines.