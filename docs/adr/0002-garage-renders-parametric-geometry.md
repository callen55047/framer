# 2. The Garage renders parametric geometry, not a 3D asset library

## Status

Accepted

## Context

The original idea for the Garage was an interactive 3D builder using real bike/component models, swappable like a configurator. Manufacturers don't publish CAD for frames, forks, or wheels — it's competitive IP — so this would require either licensing marketplace assets (inconsistent scale/orientation, ~$50-300 each) or authoring them by hand in Blender. Swapping parts also requires every asset to carry a shared mount-point convention (head tube axis, BB origin, steerer origin, axle position) that off-the-shelf assets don't have. A modest library — 30 frames, 20 forks, 15 wheelsets — is on the order of 65 hand-prepared assets, realistically months of art work, before the builder logic does anything.

Meanwhile, the rest of the system is already scraping and extracting exactly the numbers that determine a bike's shape: stack, reach, head tube angle, seat tube angle, chainstay length, BB drop, wheelbase (see the `Spec` schema in `@framer/schema`). Those numbers fully determine frame geometry, and a fork's axle-to-crown and travel determine how it changes that geometry when swapped in.

## Decision

The Garage renders a stylized, dimensionally-accurate frame built from tubes swept between joints computed from a Product's Specs, not from authored 3D assets. Swapping a component (e.g. a longer-travel fork) recomputes the geometry live — head angle slackens, stack rises, reach shortens — and the render updates alongside the numbers.

## Consequences

- The Garage is fed directly by the `ExtractSpecs` Job kind: it gets more capable every time a manufacturer spec page is processed, with no separate content pipeline.
- It answers a question real riders argue about ("what does a 160mm fork do to this frame's geometry?") that a pretty static render of the stock bike cannot answer at all.
- It ships in roughly weeks, not months, and has no dependency on licensing or an art budget.
- Cost: it will never look like a marketing render. Visual fidelity is deliberately sacrificed for dimensional correctness and for being driven by real, continuously-updated data.
- If photorealistic rendering is wanted later, real assets can be layered in per-frame once specific models are popular enough to justify the authoring cost — this decision does not preclude that, it just refuses to block on it for v1.
