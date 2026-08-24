# ADR 0001: Handbook registry in code

## Status

Accepted

## Context

The app needs a rider-facing dictionary of MTB measurements, fitment standards, concepts, and reference sources. Users asked for a "master list" the rest of the app references for comparisons and lookups.

Two shapes of data are involved:

1. **Compared entries** — each maps to a `SpecSchema` key. Compatibility Rules, grounded extraction, and `SPEC_FIELD_LABELS` are written against these keys.
2. **Explained entries** — educational content (e.g. BB height vs BB drop) without a typed Spec field yet.

Reference sources already live in `packages/schema/data/reference-sources.json` with zod validation.

## Decision

The Handbook is **code-authoritative**:

- Structured fields in `packages/schema/data/handbook.json`, validated by `packages/schema/src/handbook.ts`.
- Prose in `packages/schema/data/handbook/<slug>.md`.
- The web app reads via `GET /api/handbook` — no user CRUD in v1.
- `SPEC_FIELD_LABELS` is derived from `compared` Handbook entries, not hand-maintained in `spec.ts`.

## Consequences

**Positive**

- A `compared` entry cannot exist without a real `SpecSchema` key — tests enforce 1:1 coverage.
- Compatibility Rules, chat tools, and UI labels stay aligned without a second label table.
- Reference sources and Handbook entries version with the repo.

**Negative**

- Adding a metric requires a code change (schema key + Handbook entry + prose), not an admin UI.
- Illustrations ship as static assets under `assets/handbook/`.

## Alternatives considered

**Database-backed, user-editable catalog** — rejected because runtime-added metrics could not participate in typed Compatibility Rules or grounded extraction without also changing `SpecSchema` and redeploying rule code anyway.

**Hybrid (code canonical + user notes)** — rejected for v1 to avoid two authorities and ambiguous `compared` status.
