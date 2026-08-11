# 1. Runner communicates with the API over HTTP, never touches the database directly

## Status

Accepted

## Context

The Runner executes Jobs using a local model (Ollama on `localhost:11434`) and scrapes retailer pages from the machine it runs on. That constraint is permanent: even once the web app and Postgres move to the cloud, the model stays on a machine on the user's desk, because a locally-hosted model is the whole premise of the Job system. This means the Runner and the database will, for the foreseeable future, never be on the same machine — the opposite of the usual assumption for a background worker.

The two obvious designs:

1. The Runner connects to Postgres directly (`SELECT ... FOR UPDATE SKIP LOCKED` for claiming, plain writes for results).
2. The Runner talks to the API over HTTP, and only the API touches Postgres.

## Decision

Any job executor is a detachable HTTP client — manual worker, Runner daemon, or future agent. It claims Jobs via `POST /api/jobs/claim` (receiving an opaque `leaseToken` per claim), extends leases via heartbeat, reports Stage progress via `POST /api/jobs/:id/stages`, and finishes via `POST /api/jobs/:id/complete` or `fail`. Kind-specific writes use dedicated endpoints (`POST /api/products/resolve`, `POST /api/listings/:id/price-points`). Authentication is a static bearer token (`AGENT_TOKEN`). No executor opens a database connection.

The first pipeline proof uses `Acknowledge` jobs and a one-shot manual worker (`npm run worker -- --once`) with no model or stages. The Runner is layered on afterward for `RefreshListing`.

## Consequences

- Moving the API and Postgres to the cloud is a one-line change (the executor's `API_BASE_URL`), not a rewrite. The Runner keeps running on the user's desk, pointed at a remote API.
- The Runner can run on a different machine than the browser from day one — e.g. a desktop with a GPU for Ollama, browsed from a laptop.
- Postgres never needs to be exposed to the public internet or tunneled to reach a home machine.
- Cost: claim/heartbeat/complete/fail endpoints, lease tokens, dependency-aware claiming, and lease reclaim had to be written instead of relying on the database's native row-locking alone.
- The API becomes the sole owner of transactional integrity (e.g. Resolution, Task rollup, and cancelling dependent Jobs on failure happen server-side); executors stay dumb about catalog-wide state.
- `FRAMER_SWEEP_ENABLED` should remain off while proving the manual worker; sweep auto-enqueues inside claim when enabled.
