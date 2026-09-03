# Architecture

Structure, deployment, and layout of the Framer app. Domain vocabulary lives in [CONTEXT.md](../CONTEXT.md); this doc is the living reference for how the repo is organized and how the pieces connect.

**How to use this doc:** update it in place when a structural fact changes (new route, new job kind, deployment shift). Do not add new files under `docs/adr/`. When a decision has real alternatives worth recording for posterity, add a short note to the [Appendix: rejected alternatives](#appendix-rejected-alternatives) section here instead.

---

## Deployment model

The shipping form is a **local-first monolith**: one Node process (`@framer/api`) on `localhost` that serves the API, the built SPA, and runs background work in-process.

| Concern | Location |
|---------|----------|
| HTTP server | `@framer/api` — Express on `PORT` (default `4000`) |
| Persistence | SQLite file at `DATABASE_PATH` (default `.data/framer.db`), WAL mode, foreign keys, migrations at startup |
| Raw HTML artifacts | Filesystem at `ARTIFACTS_DIR` (default `.data/artifacts/`) |
| Web UI | Built SPA from `apps/web/dist`, served statically with SPA fallback for client routes |
| Background work | Integrated Runner in the same process via an in-memory `JobApi` adapter — no loopback HTTP for claim/stages/complete |

Backup is copying `.data/framer.db` and `.data/artifacts/` together. No Docker or separate database service is required for local development or production.

The standalone `@framer/runner` package remains for manual HTTP-based tooling (`npm run worker`, replay scripts, benchmarks) but is not required for normal operation. Multi-machine cloud API + local Runner is deferred; reintroducing it would mean restoring HTTP executor boundaries without changing the domain model.

### Environment variables (API)

Key settings from `apps/api/src/config.ts`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | HTTP listen port |
| `DATA_DIR` | `<repo>/.data` | Root for local data |
| `DATABASE_PATH` | `.data/framer.db` | SQLite file |
| `ARTIFACTS_DIR` | `.data/artifacts` | Fetched HTML storage |
| `WEB_DIST_PATH` | `apps/web/dist` | Built SPA assets |
| `RUNNER_ENABLED` | `true` | In-process job executor |
| `RUNNER_POLL_INTERVAL_MS` | `2000` | Claim loop interval |
| `FRAMER_SWEEP_ENABLED` | `true` | Watch price refresh sweep inside claim |
| `CHAT_SUMMARY_IDLE_MINUTES` | `5` | Session summary debounce window |
| `CHAT_TOOL_RESULT_MAX_CHARS` | `8000` | Cap on one Tool Call result forwarded to the model (full result still persisted) |
| `INFERENCE_CHAT_TEMPERATURE` | `0.3` | Sampling temperature for assistant chat turns; extraction stays at 0 |
| `AGENT_TOKEN` | `dev-agent-token` | Bearer token for external HTTP executors |

Inference provider settings (`INFERENCE_PROVIDER`, `LM_STUDIO_*`, pool sizes) are passed through to the integrated Runner at startup.

---

## Repo layout

npm workspaces monorepo. Build order: `@framer/schema` → `@framer/runner` → `@framer/web` → `@framer/api`.

```
framer/
├── apps/
│   ├── api/          # Express server, SQLite, integrated Runner, migrations
│   ├── web/          # React SPA (Vite)
│   └── runner/       # Job pipeline, stages, inference providers, HTTP JobApi client
├── packages/
│   └── schema/       # Shared Zod schemas, types, reference-sources.json
├── docs/             # Architecture, reference sources, benchmarks, affiliate notes
└── CONTEXT.md        # Domain glossary (Product, Listing, Job, etc.)
```

### `apps/api`

| Path | Role |
|------|------|
| `src/app.ts` | Express app: route mounting, static SPA, error handler |
| `src/index.ts` | Startup: migrations, session-summary reconcile, integrated Runner, listen |
| `src/config.ts` | Environment-backed configuration |
| `src/db/` | SQLite client, pool, migrations (`0001`–`0005`) |
| `src/routes/` | REST routers for catalog, watches, tasks, chat, runner callbacks |
| `src/services/` | Business logic (jobs, listings, chat, session summaries) |
| `src/lib/` | Job queue, resolution, compatibility rules, mappers, auth |
| `src/runner/` | In-process `JobApi` adapter and claim loop |

### `apps/web`

| Path | Role |
|------|------|
| `src/App.tsx` | Router and shell layout (sidebar + main) |
| `src/pages/` | One page component per nav destination |
| `src/components/` | Shared UI (watch cards, task rows, chat transcript, charts) |
| `src/lib/api.ts` | Typed fetch wrappers for `/api/*` |

### `apps/runner`

| Path | Role |
|------|------|
| `src/pipeline.ts` | Job kind dispatch to stage sequences |
| `src/stages/` | fetch → validate → extract → resolve → persist |
| `src/pools/` | Domain-rate-limited fetch pool; inference pool (depth 1–2) |
| `src/inference/` | LM Studio provider, extraction schemas |
| `src/lib/jobApi.ts` | Pluggable JobApi interface (HTTP or in-process) |
| `src/lib/httpJobApi.ts` | HTTP client for standalone worker mode |

### `packages/schema`

Shared types and validators consumed by api, web, and runner. Key modules: `job.ts`, `product.ts`, `listing.ts`, `watch.ts`, `chat.ts`, `spec.ts`, `grounding.ts`, `referenceSources.ts`. The reference-source inventory is `data/reference-sources.json`.

---

## API surface

All routes mount under the single Express app in `apps/api/src/app.ts`.

| Prefix | Auth | Purpose |
|--------|------|---------|
| `GET /health` | none | Liveness |
| `/api/jobs` | `AGENT_TOKEN` | Claim, heartbeat, stage report, complete, fail |
| `/api/products` | user session | Product catalog, resolution |
| `/api/listings` | user session | Listings, price points |
| `/api/watches` | user session | Watch CRUD |
| `/api/tasks` | user session | Task list and status |
| `/api/chat` | user session | Assistant sessions and messages |
| `/api/runner/listings` | `AGENT_TOKEN` | Kind-specific writes from executor (price points) |
| `/api/runner/watches` | `AGENT_TOKEN` | Sweep-related runner callbacks |
| `/api/runner/chat` | `AGENT_TOKEN` | Session summary persistence from executor |

Static files from `WEB_DIST_PATH` are served at `/`. Unmatched non-API paths fall through to `index.html` for client-side routing.

---

## Web app structure

Sidebar navigation (`apps/web/src/components/Sidebar.tsx`) maps to React Router routes in `App.tsx`:

| Route | Page | Purpose |
|-------|------|---------|
| `/` | DashboardPage | Overview |
| `/watchlist` | WatchlistPage | Product and used-item watches |
| `/garage` | GaragePage | Build speccing and parametric geometry preview |
| `/tasks` | TasksPage | Task/job status and stage timeline |
| `/assistant` | AssistantPage | AI assistant sessions |
| `/profile` | ProfilePage | Owner settings |

Layout: fixed narrow sidebar (icon nav) + scrollable main content area.

---

## Job system

See [CONTEXT.md](../CONTEXT.md) for domain terms (Task, Job, Stage, Artifact). This section covers mechanics.

### Job kinds

Closed set in `@framer/schema` (`JobKindSchema`):

| Kind | Stages | Status |
|------|--------|--------|
| `Acknowledge` | none | Pipeline proof — validates claim/complete only |
| `RefreshListing` | fetch → validate → extract → resolve → persist | Implemented |
| `SummarizeChatSession` | inference-only | Implemented |
| `ExtractSpecs` | TBD | Schema stub |
| `DiscoverListings` | TBD | Schema stub |

The integrated Runner (`startRunner.ts`) currently claims `Acknowledge`, `RefreshListing`, and `SummarizeChatSession`.

### Claiming and leases

Jobs live in SQLite with status `queued | leased | succeeded | failed | cancelled`. An executor claims via `JobApi.claimJob()`, receiving an opaque `leaseToken`. While leased, the executor heartbeats, reports Stage progress, and completes or fails.

Claim eligibility requires:

1. Status `queued`
2. Predecessor Job succeeded (if `depends_on_job_id` is set)
3. **`not_before` gate passed** — `not_before` is null or `not_before <= now`

Tasks roll up Job outcomes (`queued`, `active`, `succeeded`, `partial`, `failed`).

### Not-before time gate

Background work that should wait for idleness uses a durable `not_before` column on `jobs` rather than in-memory debounce or a periodic scan.

**Session summaries:** each persisted Message upserts one queued `SummarizeChatSession` Job for that Session, setting `not_before = now + CHAT_SUMMARY_IDLE_MINUTES`. Repeated Messages push `not_before` forward instead of inserting duplicates. Boot-time reconcile schedules any Session with unsummarized Messages and no pending Job.

**Watch sweep:** `FRAMER_SWEEP_ENABLED` enqueues `RefreshListing` Jobs for Watches whose newest price point is older than 24 hours. This runs inside the claim path, not a separate cron daemon.

Jobs with a future `not_before` appear in the Tasks tab as queued but unclaimable until the gate opens.

### HTTP executor path (optional)

The default path is in-process. For manual tooling, `@framer/runner` can run as a standalone HTTP client:

- `POST /api/jobs/claim` — receive Job + `leaseToken`
- `POST /api/jobs/:id/heartbeat` — extend lease
- `POST /api/jobs/:id/stages` — report Stage progress
- `POST /api/jobs/:id/complete` | `fail` — finish Job
- Kind-specific writes via `/api/runner/*` endpoints

Authentication is a static bearer token (`AGENT_TOKEN`). No executor opens a database connection; the API owns transactional integrity (Resolution, Task rollup, cancelling dependents on failure).

This boundary exists so a future cloud-hosted API + desk-side Runner remains a one-line `API_BASE_URL` change, but it is not the default deployment today.

### RefreshListing pipeline

```
fetch → validate → extract → resolve → persist
  │        │          │         │          │
  │        │          │         │          └─ price point + product link
  │        │          │         └─ POST /api/products/resolve (server-side)
  │        │          └─ local model, schema-constrained extraction
  │        └─ platform-specific page text extraction
  └─ rate-limited per domain; artifact stored on disk
```

Stage retries are scoped to the failed Stage (max 3 attempts), not the whole Job. The persisted fetch artifact allows offline replay when prompts change.

---

## Garage rendering

The Garage renders **parametric geometry from Specs**, not authored 3D assets.

Manufacturers do not publish CAD for frames, forks, or wheels. Licensing or hand-authoring a configurator-scale asset library (mount-point conventions, consistent scale) would be months of art work before the builder logic does anything.

Instead, the Garage builds a stylized, dimensionally-accurate frame from tubes swept between joints computed from a Product's Specs (stack, reach, head angle, chainstay, etc.). Swapping a component (e.g. a longer-travel fork) recomputes geometry live — head angle slackens, stack rises, reach shortens.

**Consequences:**

- Fed directly by `ExtractSpecs` Jobs — gets more capable as manufacturer pages are processed
- Answers "what does a 160mm fork do to this frame's geometry?" — a static marketing render cannot
- Ships in weeks, not months; no art budget dependency
- Will never look like a marketing render; dimensional correctness over visual fidelity
- Photorealistic assets can be layered in later per popular model without reversing this approach

---

## Assistant

Assistant Sessions are persisted conversations with a 128k-token context budget. When full, the Session stops accepting messages.

- **Tool Calls** — read-only lookups mid-turn (`chatTools.ts`); shown collapsed in the transcript like Job Stages. Each call gets a fresh UUID that is both the persisted tool row's id and the `tool_call_id` the provider sees, and the assistant row stores its `tool_calls` so history replays with valid pairing. Results over `CHAT_TOOL_RESULT_MAX_CHARS` are truncated for the model only. Up to 10 tool iterations per turn; after that a tools-off call forces a final answer
- **No-tool-call guardrail** — the first attempt at a turn is buffered rather than streamed live. If it comes back with no tool calls and no clarification, the reply is discarded, a one-time nudge is appended (not persisted), and the turn retries — this stops the model from answering bike/parts/price questions from memory instead of looking them up. The retry itself streams normally, whether it ends up calling a tool or answering off-topic in character
- **Clarification** — the assistant ends its turn by calling `askClarifyingQuestion`; persisted as an assistant Message with `toolName` set and options in `toolArgs`, streamed as a `clarification` SSE event, rendered as tappable chips. Lookups issued in the same iteration run first
- **Catalog price tools** — `searchProducts` (category/year filters, cheapest live price), `getProductListings`, `getPriceHistory`, `listRetailers`. The derived Product price (cheapest in-stock, new, active Listing) lives in `productListingsService.ts`
- **Session Summary** — compressed by a background `SummarizeChatSession` Job after idle; read by a *later* Session via tool call, never injected into the current turn's context
- **Assistant Benchmark** — scores `SYSTEM_PROMPT` bets (tool routing, tone, the no-tool-call guardrail) against a live model over scripted Scenarios, sampled to account for non-determinism. See [local-model-benchmarks.md](./local-model-benchmarks.md#assistant-benchmark)

See [CONTEXT.md](../CONTEXT.md#assistant) for glossary terms.

---

## Related docs

| Doc | Contents |
|-----|----------|
| [CONTEXT.md](../CONTEXT.md) | Domain language and example dialogue |
| [reference-sources.md](./reference-sources.md) | Fetch allowlist and source roles |
| [local-model-benchmarks.md](./local-model-benchmarks.md) | Extraction and Assistant Benchmark corpora and baseline workflow |
| [affiliate-programs.md](./affiliate-programs.md) | Retailer feed enrollment notes |

---

## Appendix: rejected alternatives

Short record of paths considered and not taken. Update when revisiting a decision.

### Runner connects to Postgres directly

The Runner executes Jobs using a local model and scrapes from the machine it runs on. Even if the API moves to the cloud, the model stays on the user's desk.

**Rejected:** direct Postgres access (`SELECT … FOR UPDATE SKIP LOCKED` for claiming). Would require exposing Postgres to the public internet or tunneling to a home machine, and would duplicate transactional logic already owned by the API.

**Chosen:** HTTP executor boundary (optional today, in-process by default). API is sole owner of Resolution, Task rollup, and catalog writes.

### Periodic scan for session summarization

**Rejected:** timer polling Sessions whose `updated_at` is older than N minutes. Adds wakeups when nothing is stale; contradicts the "no general scheduler" principle from the Sweep glossary entry.

**Rejected:** in-memory `setTimeout` debounce per Session. Lost on restart; invisible in Tasks tab until fire.

**Chosen:** durable `not_before` on the Job row. Restart-safe, visible in Tasks, picked up by the existing claim loop.

### 3D asset library for the Garage

**Rejected:** real bike/component 3D models with shared mount-point conventions. Requires licensing or hand-authoring ~65+ assets before builder logic is useful.

**Chosen:** parametric geometry from extracted Specs. See [Garage rendering](#garage-rendering).

### Separate cloud API as v1 deployment

**Rejected (for now):** cloud-hosted API + Postgres with a detachable home-machine Runner as the first shipping form.

**Chosen:** local-first monolith with SQLite. Cloud split deferred without domain model changes.

### LLM-as-judge for the Assistant Benchmark's tone scoring

**Rejected:** scoring tone/helpfulness by asking a model to rate replies against a rubric. The model under test (`google/gemma-4-e2b`) can't credibly judge its own tone; a judge strong enough to be trustworthy means a second, hosted-API provider, which the cloud-API rejection above already ruled out for v1.

**Chosen:** mechanical checks (required/forbidden tool calls, argument predicates, forbidden phrasing, length caps) plus a full transcript artifact (`last-benchmark.md`) for a human to read. See [local-model-benchmarks.md](./local-model-benchmarks.md#assistant-benchmark).

### Live reference fetches during the Assistant Benchmark

**Rejected:** letting research Scenarios hit the real fetch allowlist. Two nondeterministic inputs (model + network) means a failed run never tells you which one moved, and it hammers manufacturer/retailer sites on every run.

**Chosen:** recorded reference pages replayed from disk (`apps/api/fixtures/assistant-benchmark/pages/`), the same discipline as the **Artifact** replay pattern used for extraction. Only the model is live.
