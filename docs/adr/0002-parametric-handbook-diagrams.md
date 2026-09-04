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

## Amendment (2026-09)

The initial `bikeGeometry.ts` had several defects that made the rendered bike look distorted: the BB sat on the axle line instead of below it, the ground line was drawn hundreds of millimeters above the wheels, the head tube leaned backward and the seat tube leaned forward, and the rear-suspension linkage never geometrically solved (it silently fell back to a fixed point at every travel position, so the shock, leverage curve, and axle path were all fictitious). None of this was a flaw in the parametric-overlay pattern itself — it was wrong geometry underneath a sound architecture.

Fixed by:

- **Coordinate datum.** +x forward, +y down (unchanged), but the datum is now the topped-out (zero travel) axle line at y = 0. `bb.y` is the BB drop below that line; `groundY` is a wheel radius below it. Travel = 0 means fully extended ("top-out"), matching how shock eye-to-eye length is quoted, rather than sag.
- **Rear suspension is a Horst link**, modelled after the Rocky Mountain Altitude 2021 (29", size M, Ride-9 neutral), not a split-pivot/concentric design: the chainstay pivots on the front triangle (main pivot), the seatstay pivots on the chainstay ahead of the rear axle (Horst pivot), and a rocker link connects the seatstay to a shock mounted low on the down tube. The linkage is solved by bisecting the chainstay-link angle until the rear axle has risen by the requested travel; an unreachable travel throws rather than silently falling back to a fixed point.
- **`REFERENCE_TRAIL_BIKE`** now holds the Altitude 2021 numbers (reach 449, stack 624, HTA 64.4°, effective STA 75.4°, chainstay 438, wheelbase 1218, BB drop 34, wheel radius 370, rear travel 160).
- **Instant centre and anti-squat** are computed from the actual linkage geometry (`instantCentre`, `antiSquatConstruction`, `antiSquatPercent` in `packages/schema/src/bikeGeometry.ts`) rather than approximated with magic offsets.
- **Rendering**: `DEFAULT_VIEWBOX` widened to 800×400 to match the ~2:1 aspect ratio of its containers. All overlays — including the axle-path trace, previously a second absolutely-positioned `<svg>` with its own `<marker id="arrow">` — render inside the one `<svg>` the base frame uses, so no diagram ever needs a second SVG or an element id that could collide with another diagram on the same page.
