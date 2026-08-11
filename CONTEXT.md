# Framer

Tracking and building mountain bikes and MTB components: watching prices across retailers, speccing builds in 3D, and running background research jobs against a local model.

## Language

### Catalog

**Product**:
A retailer-independent thing that exists in the world, identified by brand, model, and model year. The DT Swiss XM 1700 SPLINE 29 (2024) is one Product regardless of who sells it.
_Avoid_: Item, SKU, part

**Listing**:
One retailer's page offering one **Product** for sale, identified by URL. Carries its own price, stock status, and price history. Many **Listings** may point at one **Product**.
_Avoid_: Link, offer, page

**Feed**:
An affiliate network datafeed of a retailer's catalog, carrying price, availability, and often a GTIN. The preferred source for new-retail **Listings**; scraping is reserved for used marketplaces and non-enrolled retailers.
_Avoid_: Import, sync, catalog dump

**Resolution**:
Deciding which **Product** a newly ingested **Listing** refers to. Prefers an exact join on GTIN where a **Feed** supplies one; otherwise graded high, review, or new by deterministic agreement of brand, normalized model, and model year.
_Avoid_: Matching, dedup, linking

**Spec**:
A structured, typed attribute of a **Product** that came from a manufacturer source, such as steerer standard, axle standard, brake mount, or maximum fork travel. Distinct from marketing copy.
_Avoid_: Attribute, property, feature

**Used Item**:
A **Listing** for one unique physical bike or part, typically from a marketplace. Has no sibling **Listings**, never restocks, and terminates in a `sold` state rather than fluctuating in price indefinitely.
_Avoid_: Second-hand listing, classified

**Watch**:
A standing interest in either a **Product**, tracking the cheapest live price across sellers, or a single **Listing**, tracking one **Used Item** until it sells.
_Avoid_: Watchlist item, tracked item, favourite

### Building

**Build**:
A named bike as a set of **Slots**, either `owned` (assembled and ridden) or `planned` (being specced). Status changes in place; a planned **Build** becomes an owned one without becoming a different thing.
_Avoid_: Bike, spec, config, setup

**Slot**:
One position in a **Build** — frame, fork, wheelset, drivetrain, brakes, cockpit, tires — holding at most one **Product**. Its cost is the cheapest live **Listing** for that **Product**, so a **Build's** total moves as prices move.
_Avoid_: Position, component, part

### Fitment

**Compatibility Rule**:
A deterministic statement over two **Products'** **Specs** that decides whether they can be assembled together, evaluated by query rather than by the model.
_Avoid_: Fitment check, compatibility check

### Work

**Task**:
Something the user asked for, and the unit the Tasks tab lists. Spawns one or more **Jobs**, and its status rolls up from theirs — including a partial state when some **Jobs** succeeded and others failed.
_Avoid_: Request, query

**Job**:
A unit of background work of one enumerated kind, claimed and completed by any HTTP **executor** (manual worker, Runner daemon, or future remote agent) on behalf of a **Task**. Jobs in one Task may form a linear chain: a Job becomes claimable only after its predecessor succeeds. Each kind declares an input schema, an output schema, and a validator. Kinds include `Acknowledge` (pipeline proof, no stages), `RefreshListing`, `ExtractSpecs`, and `DiscoverListings`.
_Avoid_: Action, item

**Stage**:
One step within a **Job** — fetch, extract, resolve, persist. Retries are scoped to the failed **Stage**, not the whole **Job**.
_Avoid_: Step, phase

**Artifact**:
The persisted output of a **Stage**, most importantly the raw fetched HTML. Retained so that extraction can be replayed offline against real pages when prompts change.
_Avoid_: Cache, snapshot, blob

**Extraction**:
Turning a fetched **Artifact** into structured fields via the local model under schema-constrained decoding. Shape is guaranteed by the constraint; truth is not. See `docs/local-model-benchmarks.md` for the POC fixture corpus and baseline comparison workflow.
_Avoid_: Parsing, scraping, enrichment

**Grounding**:
The rule that every value produced by **Extraction** must normalize-match text actually present in the source **Artifact**. Values the model invented are rejected rather than persisted.
_Avoid_: Verification, fact-check, confidence

**Runner**:
An optional long-lived daemon (or one-shot drain mode) that claims and executes **Jobs** over HTTP — typically `RefreshListing` with a local model. Holds two separate bounded pools: a fetch pool rate-limited per domain, and an inference pool of depth one or two. The pipeline is first proven with a manual one-shot worker and `Acknowledge` jobs before relying on the Runner. Not a cron job.
_Avoid_: Worker, cron, scheduler

**Sweep**:
The **Runner's** standing query for any **Watch** whose newest price point is older than 24 hours, enqueuing a refresh so that price history keeps accumulating. A placeholder for per-source scheduling, not a general scheduler.
_Avoid_: Cron, schedule, poller

**Reference source**:
A known website in the project's fetch inventory — manufacturer spec pages, retailers, compatibility databases, or review sites — each with a category and allowed job kinds. The Runner may warn or block fetches to domains outside this registry depending on configuration. See `docs/reference-sources.md`.
_Avoid_: Trusted source, whitelist entry

## Flagged ambiguities

- **Repo name "framer"** — collides with the Framer design tool, and reads as "frames" when the app spans whole builds. Worth renaming before it appears in a hundred import paths.
- **"Price history"** — belongs to a **Listing**, never to a **Product**. A **Product's** price is always derived as the cheapest live **Listing** at a moment in time, and is not stored.
- **"Compatibility"** — always a **Compatibility Rule** evaluated over **Specs**, never a model-authored opinion. If someone proposes asking the model whether two parts fit, that is a different feature and needs a different name.

## Example dialogue

**Dev**: Someone watched a used Instinct on Pinkbike and it vanished. Did the Watch fail?

**Rider**: No, it sold. That's a Used Item — one physical bike, so it has no sibling Listings and it ends in `sold`. That's a terminal state, not a failure.

**Dev**: But the same rider also watches a DT Swiss XM 1700. That one never ends.

**Rider**: Right, because that Watch targets a Product, not a Listing. Four shops sell it, so what you're tracking is the cheapest live Listing across all four. Each Listing carries its own price history; the Product doesn't have one.

**Dev**: When Jenson's Feed gives us a new row for it, how do we know it's the same wheelset?

**Rider**: If the Feed carries a GTIN, Resolution is just an exact join. If it doesn't, we fall back to brand plus normalized model plus year, and anything short of full agreement makes a new Product rather than merging. A wrong merge corrupts price history; a wrong split is one click to fix.

**Dev**: The rider dropped a 160mm fork into their planned Build and the UI complained.

**Rider**: A Compatibility Rule fired. The frame's Spec caps fork travel at 150mm, and that's a database comparison over two Specs, not the model's opinion. The model only ever put `max_travel_mm: 150` into the Product in the first place, and only because that number appeared verbatim on the manufacturer page — that's Grounding.

**Dev**: And the Tasks tab shows "partial" on their deal search.

**Rider**: One Task, three Jobs, one per retailer. Two returned Listings, one failed at the fetch Stage. The Artifact from the two that worked is still on disk, so retrying only re-runs the broken Stage — we don't re-fetch pages that already succeeded.
