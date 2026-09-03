import { afterEach, describe, expect, it } from "vitest";
import { LOCAL_OWNER_ID, REFERENCE_SOURCES } from "@framer/schema";
import { createTestServer } from "../test/createTestServer.js";

const PRODUCT_A = "11111111-1111-4111-8111-111111111111"; // fork, 2024
const PRODUCT_B = "22222222-2222-4222-8222-222222222222"; // fork, 2023
const PRODUCT_C = "33333333-3333-4333-8333-333333333333"; // frame, no listings
const LISTING_CHEAP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // active, jenson, $500 -> latest $480
const LISTING_VARIANTS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // active, other shop, variants 450 (oos) + 470 (in stock)
const LISTING_INACTIVE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // inactive, $300
const LISTING_USED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // used marketplace, $200
const VARIANT_OOS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const VARIANT_IN = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const WATCH_PINNED = "99999999-9999-4999-8999-999999999999";

const JENSON_DOMAIN = REFERENCE_SOURCES.find((source) => source.id === "jenson-usa")!.domains[0]!;

async function seed() {
  const { pool } = await import("../db/pool.js");
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);

  await q(`insert into products (id, brand, model, model_year, category, specs) values
    ($1, 'Fox', '36 Factory', 2024, 'fork', '{}'),
    ($2, 'Fox', '36 Performance', 2023, 'fork', '{}'),
    ($3, 'Santa Cruz', 'Hightower', 2024, 'frame', '{}')`, [PRODUCT_A, PRODUCT_B, PRODUCT_C]);

  await q(`insert into listings (id, product_id, url, domain, status, is_used, title, last_checked_at) values
    ($1, $5, 'https://${JENSON_DOMAIN}/fox-36', $6, 'active', 0, 'Fox 36 Factory', '2026-09-01T00:00:00Z'),
    ($2, $5, 'https://shop.example.com/fox-36', 'shop.example.com', 'active', 0, 'Fox 36 Factory', '2026-09-01T00:00:00Z'),
    ($3, $5, 'https://old.example.com/fox-36', 'old.example.com', 'inactive', 0, 'Fox 36', null),
    ($4, $5, 'https://pinkbike.example.com/buysell/1', 'pinkbike.example.com', 'active', 1, 'Used Fox 36', null)`,
    [LISTING_CHEAP, LISTING_VARIANTS, LISTING_INACTIVE, LISTING_USED, PRODUCT_A, JENSON_DOMAIN]);

  await q(`insert into price_points (id, listing_id, price, currency, in_stock, scraped_at) values
    ('p1', $1, 500, 'USD', 1, '2026-08-01T00:00:00Z'),
    ('p2', $1, 520, 'USD', 1, '2026-08-15T00:00:00Z'),
    ('p3', $1, 480, 'USD', 1, '2026-09-01T00:00:00Z'),
    ('p4', $2, 999, 'USD', 1, '2026-08-01T00:00:00Z'),
    ('p5', $3, 300, 'USD', 1, '2026-08-01T00:00:00Z'),
    ('p6', $4, 200, 'USD', 1, '2026-08-01T00:00:00Z')`, [LISTING_CHEAP, LISTING_VARIANTS, LISTING_INACTIVE, LISTING_USED]);

  await q(`insert into listing_variants (id, listing_id, provider_id, label, price, currency, in_stock, first_seen_at, last_seen_at) values
    ($1, $3, 'v-oos', '150mm', 450, 'USD', 0, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z'),
    ($2, $3, 'v-in', '160mm', 470, 'USD', 1, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')`,
    [VARIANT_OOS, VARIANT_IN, LISTING_VARIANTS]);

  await q(`insert into watches (id, owner_id, target_type, listing_id, variant_selection, listing_variant_id) values
    ($1, $2, 'listing', $3, 'specific', $4)`, [WATCH_PINNED, LOCAL_OWNER_ID, LISTING_VARIANTS, VARIANT_IN]);

  await q(`insert into variant_price_points (id, variant_id, watch_id, price, currency, in_stock, scraped_at) values
    ('vp1', $1, $2, 490, 'USD', 1, '2026-08-10T00:00:00Z'),
    ('vp2', $1, $2, 470, 'USD', 1, '2026-09-01T00:00:00Z')`, [VARIANT_IN, WATCH_PINNED]);
}

describe("chat catalog tools", () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await close?.();
    close = null;
  });

  async function setup() {
    const server = await createTestServer();
    close = server.close;
    await seed();
    const { executeChatTool } = await import("./chatTools.js");
    return (name: string, args: Record<string, unknown> = {}) =>
      executeChatTool(name, args, { sessionId: "test-session" });
  }

  it("searchProducts filters by category and year and derives the cheapest live price", async () => {
    const run = await setup();

    const forks = (await run("searchProducts", { query: "fox", category: "fork" })) as Array<Record<string, unknown>>;
    expect(forks.map((product) => product.id).sort()).toEqual([PRODUCT_A, PRODUCT_B].sort());

    const fox2024 = (await run("searchProducts", { query: "fox 36", modelYear: 2024 })) as Array<Record<string, unknown>>;
    expect(fox2024).toHaveLength(1);
    expect(fox2024[0]!.id).toBe(PRODUCT_A);
    expect(fox2024[0]!.listingCount).toBe(4);
    expect(fox2024[0]!.activeListingCount).toBe(3);
    // Inactive ($300) and used ($200) are excluded; variant listing aggregate is $470 which beats Jenson's $480.
    expect(fox2024[0]!.cheapestLive).toMatchObject({ price: 470, currency: "USD", listingId: LISTING_VARIANTS });

    const frames = (await run("searchProducts", { category: "frame" })) as Array<Record<string, unknown>>;
    expect(frames).toHaveLength(1);
    expect(frames[0]!.cheapestLive).toBeNull();
    expect(frames[0]!.listingCount).toBe(0);

    await expect(run("searchProducts", {})).rejects.toThrow(/query or a category/);
    await expect(run("searchProducts", { category: "saddle" })).rejects.toThrow(/Unknown category/);
  });

  it("getProductListings resolves by text, sorts cheapest live first, and surfaces other matches", async () => {
    const run = await setup();
    const result = (await run("getProductListings", { query: "Fox 36" })) as {
      product: { id: string };
      otherMatches: Array<{ id: string }>;
      derivedPrice: { price: number; listingId: string; retailer: string | null } | null;
      listingCount: number;
      listings: Array<Record<string, unknown>>;
    };

    expect([PRODUCT_A, PRODUCT_B]).toContain(result.product.id);
    expect(result.otherMatches.length + 1).toBe(2);

    const exact = (await run("getProductListings", { productId: PRODUCT_A })) as typeof result;
    expect(exact.listingCount).toBe(4);
    expect(exact.derivedPrice).toMatchObject({ price: 470, listingId: LISTING_VARIANTS });
    // Live (active + in stock) listings first by price, so the $200 used one leads even though
    // derivedPrice ignores it; the inactive listing sorts last.
    expect(exact.listings.map((listing) => listing.listingId)).toEqual([
      LISTING_USED,
      LISTING_VARIANTS,
      LISTING_CHEAP,
      LISTING_INACTIVE,
    ]);
    const variantListing = exact.listings[1]!;
    expect(variantListing.priceSource).toBe("variants");
    expect(variantListing.variantSummary).toMatchObject({ lowestInStockPrice: 470, availableCount: 1, totalCount: 2 });
    const jenson = exact.listings[2]!;
    expect(jenson.retailer).toBe("Jenson USA");
    expect(jenson.price).toBe(480);

    const inStockNew = (await run("getProductListings", { productId: PRODUCT_A, inStockOnly: true, includeUsed: false })) as typeof result;
    expect(inStockNew.listings.map((listing) => listing.listingId)).toEqual([LISTING_VARIANTS, LISTING_CHEAP]);
  });

  it("getPriceHistory works by listing with since/limit and by variant-pinned watch", async () => {
    const run = await setup();

    const byListing = (await run("getPriceHistory", { listingId: LISTING_CHEAP })) as {
      points: Array<{ price: number }>;
      summary: Record<string, unknown>;
      target: Record<string, unknown>;
    };
    expect(byListing.points.map((point) => point.price)).toEqual([500, 520, 480]);
    expect(byListing.summary).toMatchObject({ count: 3, min: 480, max: 520, changePct: -4, truncated: false });
    expect(byListing.target.domain).toBe(JENSON_DOMAIN);

    const since = (await run("getPriceHistory", { listingId: LISTING_CHEAP, since: "2026-08-10" })) as typeof byListing;
    expect(since.points.map((point) => point.price)).toEqual([520, 480]);

    const limited = (await run("getPriceHistory", { listingId: LISTING_CHEAP, limit: 2 })) as typeof byListing;
    expect(limited.points.map((point) => point.price)).toEqual([520, 480]);
    expect(limited.summary.truncated).toBe(true);

    const byWatch = (await run("getPriceHistory", { watchId: WATCH_PINNED })) as typeof byListing;
    expect(byWatch.points.map((point) => point.price)).toEqual([490, 470]);
    expect(byWatch.target.pinnedVariantLabel).toBe("160mm");

    await expect(run("getPriceHistory", {})).rejects.toThrow(/exactly one/);
    await expect(run("getPriceHistory", { listingId: LISTING_CHEAP, watchId: WATCH_PINNED })).rejects.toThrow(/exactly one/);
  });

  it("listRetailers groups by domain and enriches known reference sources", async () => {
    const run = await setup();
    const retailers = (await run("listRetailers")) as Array<Record<string, unknown>>;
    expect(retailers).toHaveLength(4);
    const jenson = retailers.find((retailer) => retailer.domain === JENSON_DOMAIN)!;
    expect(jenson.name).toBe("Jenson USA");
    expect(jenson.listingCount).toBe(1);
    expect(jenson.activeListingCount).toBe(1);
    const used = retailers.find((retailer) => retailer.domain === "pinkbike.example.com")!;
    expect(used.usedListingCount).toBe(1);
    expect(used.name).toBeNull();
  });

  it("askClarifyingQuestion is never executed as a lookup", async () => {
    const run = await setup();
    await expect(run("askClarifyingQuestion", {})).rejects.toThrow(/requires a non-empty question/);
  });
});
