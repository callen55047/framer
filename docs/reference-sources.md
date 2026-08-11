# Reference sources

Canonical inventory of MTB websites the Runner may fetch when executing model-backed jobs. Machine-readable catalog: [`packages/schema/data/reference-sources.json`](../packages/schema/data/reference-sources.json). Typed helpers live in `@framer/schema` (`referenceSources.ts`).

See [CONTEXT.md](../CONTEXT.md) for the boundary: the Runner fetches pages; the local model extracts from page text; **Grounding** rejects values not present in the fetched HTML. Reference sources define **where** to look and **what role** each domain plays—not what to trust without grounding.

For enrolled retailers, affiliate **Feeds** remain the preferred path for new-retail Listings once feed ingestion lands; see [affiliate-programs.md](./affiliate-programs.md). Retailer URLs here are the scrape fallback and POC inventory.

## Fetch allowlist

The Runner checks fetched URLs against this registry via `FETCH_ALLOWLIST_MODE` in `apps/runner/.env`:

| Mode | Behavior |
|------|----------|
| `off` | No domain check |
| `warn` (default) | Log a warning for unknown domains, then fetch |
| `enforce` | Throw before fetch if the domain is not in the registry |

Use `warn` during POC and when watching ad-hoc used-marketplace URLs. Switch to `enforce` when you want to restrict the Runner to known sources only.

## Source roles

| Category | Job kinds | Grounding use |
|----------|-----------|---------------|
| Manufacturer Specs & Compatibility | `ExtractSpecs` | Primary Spec source |
| Technical Reference & Compatibility | `ExtractSpecs` | Compatibility reference |
| Component Database & Compatibility | `ExtractSpecs` | Structured lookup pages |
| Bike Specs & Comparison | `ExtractSpecs` | Bike-level geometry/spec pages |
| Tire Testing & Specifications | `ExtractSpecs` | Tire-specific Specs |
| Retailer Pricing / Retailer Pricing Specs | `RefreshListing`, `DiscoverListings` | Listing price/title/stock only |
| MTB News & Reviews / Product Testing | `DiscoverListings` (some also `RefreshListing`) | Supplementary research only—never persisted as Specs without manufacturer grounding |

Review and news sites must not be used as Spec sources. Only manufacturer and technical-reference pages supply grounded Product Specs per [CONTEXT.md](../CONTEXT.md#Spec).

## Catalog

### Manufacturer Specs & Compatibility

| Name | URL |
|------|-----|
| Shimano Product Information | https://productinfo.shimano.com/ |
| SRAM Service | https://www.sram.com/en/service |
| RockShox TrailHead | https://trailhead.rockshox.com/ |
| FOX Bike Tech Help Center | https://tech.ridefox.com/bike/ |

### Technical Reference & Compatibility

| Name | URL |
|------|-----|
| Park Tool Repair Help | https://www.parktool.com/en-us/blog/repair-help |

### Component Database & Compatibility

| Name | URL |
|------|-----|
| Specshift | https://www.specshift.bike/ |

### Bike Specs & Comparison

| Name | URL |
|------|-----|
| 99 Spokes | https://99spokes.com/ |

### Tire Testing & Specifications

| Name | URL |
|------|-----|
| Bicycle Rolling Resistance | https://www.bicyclerollingresistance.com/mtb-reviews |

### MTB News & Reviews

| Name | URL |
|------|-----|
| Pinkbike | https://www.pinkbike.com/ |
| Vital MTB | https://www.vitalmtb.com/ |
| BikeRadar | https://www.bikeradar.com/ |
| Singletracks | https://www.singletracks.com/ |

### MTB Reviews & Product Testing

| Name | URL |
|------|-----|
| The Loam Wolf | https://theloamwolf.com/ |
| BLISTER | https://blisterreview.com/ |
| NSMB | https://nsmb.com/ |

### Retailers

| Name | URL | Notes |
|------|-----|-------|
| Jenson USA | https://www.jensonusa.com/ | Affiliate program — see [affiliate-programs.md](./affiliate-programs.md) |
| Worldwide Cyclery | https://www.worldwidecyclery.com/ | Affiliate program |
| Competitive Cyclist | https://www.competitivecyclist.com/ | Scrape fallback |
| Bike-Discount | https://www.bike-discount.de/ | Scrape fallback |
| BIKE24 | https://www.bike24.com/ | Scrape fallback |

## Gaps

- POC benchmark fixtures include `rei.com`, which is not in this catalog. Live REI watches will log an unknown-domain warning under default settings.
- `ExtractSpecs` and `DiscoverListings` Runner pipelines are not implemented yet; the registry is ready via `getReferenceSourcesForJobKind()`.
