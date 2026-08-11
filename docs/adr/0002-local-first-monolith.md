# 2. Local-first monolith with integrated runner

## Status

Accepted (supersedes ADR-0001 for the default deployment model)

## Context

ADR-0001 assumed the Runner would always be a detachable HTTP client because the API and database might live in the cloud while Ollama stayed on a local machine. The product direction changed: the first shipping form is a **single localhost Node process** that serves the web app, owns a SQLite database file, and runs background work in-process.

## Decision

- One Node process (`@framer/api`) serves `/api/*`, the built SPA, and an SPA fallback for client routes.
- Persistence is an application-managed SQLite file (`DATABASE_PATH`, default `.data/framer.db`) with WAL mode, foreign keys, and migrations at startup.
- The Runner pipeline runs in-process via a direct `JobApi` adapter — no loopback HTTP for job claim, stages, or completion.
- Raw HTML artifacts remain on the filesystem under `ARTIFACTS_DIR` (default `.data/artifacts`).
- The standalone `@framer/runner` package remains for manual HTTP-based tooling (`npm run worker`, replay scripts) but is not required for normal operation.

## Consequences

- No Docker or separate database service for local development or production.
- Backup is copying `.data/framer.db` and `.data/artifacts/` together.
- Multi-machine cloud API + local Runner is deferred; reintroducing it would mean restoring HTTP executor boundaries without changing the domain model.
- SQLite serializes writers; concurrent job claims are safe within short transactions but not designed for multi-host horizontal scale.
