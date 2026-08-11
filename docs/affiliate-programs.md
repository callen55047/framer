# Affiliate program applications (Feed retrieval)

Not automatable — each application asks for a real site URL, business/tax
details, and payout information that only you can provide. This is the
checklist to actually apply; see CONTEXT.md#Feed and the plan's "Decisions
locked" for why this matters (Feeds are the primary new-retail source, not
scraping, for enrolled retailers). Retailer scrape URLs also appear in
[reference-sources.md](./reference-sources.md) as the fallback inventory.

## Jenson USA

- Apply at: https://www.jensonusa.com/our-culture/affiliate-program
- Distributed via Impact or AvantLink (their program manager assigns one).
- Qualifying sites include "Cycling Hobby Sites" — a personal project plausibly
  qualifies, but approval is a human review, not automatic.
- Terms once approved: 3% commission, 30-day cookie, datafeed access via
  whichever network you're placed on.
- What you'll need: site URL (can be the deployed `apps/web`, or a simple
  placeholder describing the project), a short description of what the site
  does, and a payout method (even if you never intend to collect payouts,
  the field is typically required).

## Worldwide Cyclery

- Apply at: https://worldwidecyclery.com/pages/affiliate-program
- Read their affiliate terms first (linked from that page) before applying.
- Terms: 4-10% commission depending on volume, 30-day cookie.

## Competitive Cyclist / Backcountry

- Their affiliate program redirects through Backcountry.com and was
  unavailable to check directly at research time (region-gated page). Worth
  a follow-up look, but not blocking — Jenson and Worldwide Cyclery cover
  enough SKU volume to validate the Feed ingestion path on their own.

## After approval

Once a network (Impact or AvantLink) grants access, the datafeed itself is
typically a CSV/XML/JSON URL with an API key. Feed ingestion is not yet
implemented (see the plan's "After the slice" ordering — it's the first
thing built after the RefreshListing slice is proven). When it lands, credentials
go in `apps/runner/.env` alongside `OLLAMA_*`, never committed.
