# ADR 0002: Parametric handbook diagrams

## Status

Accepted

## Context

ADR 0001 established that Handbook illustrations ship as static assets under `assets/handbook/`. Geometry overlays used a base-bike SVG plus per-metric overlay SVGs with hand-maintained coordinates.

That approach failed in practice:

- Overlay coordinates drifted from the base frame (e.g. chainstay annotation pointed at the front axle).
- SVG loaded via `<img>` cannot be driven by React state, so scrubbable suspension travel was impossible.
- Each new annotated point required duplicating coordinates across files.

## Decision

Geometry and suspension Handbook entries use **parametric inline SVG** rendered by React components:

- Frame geometry and split-pivot kinematics live in `packages/schema/src/bikeGeometry.ts` (browser-safe, exported via `@framer/schema/browser`).
- `HandbookIllustrationSchema` gains a `diagram` kind with a diagram id and optional annotation id.
- The web app renders `HandbookDiagram` components that derive frame and annotation geometry from shared solved points.
- Interactive entries (`suspension-travel`, `anti-squat`) expose a user-scrubbable travel slider on the entry page; catalog cards render static at sag.
- Standalone part illustrations (steerer, BB shell, brake mount, etc.) remain static SVG assets.

## Consequences

**Positive**

- Annotations cannot drift from the frame — both derive from `resolveFramePoints`.
- Suspension travel, axle path, and leverage ratio are computed from the same kinematics model.
- Geometry can later be driven by real `Spec` values without redrawing assets.

**Negative**

- Diagram rendering requires the web app (no static URL for geometry illustrations).
- `illustrationPath` is `null` for diagram entries; API and chat tools expose `diagram` and `annotation` ids instead.
- Adding a new parametric diagram requires a React annotation component and a registry entry.

## Supersedes

ADR 0001 consequence: "Illustrations ship as static assets under `assets/handbook/`" — applies only to standalone part illustrations, not geometry/suspension diagrams.
