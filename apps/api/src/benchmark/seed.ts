import { LOCAL_OWNER_ID, REFERENCE_SOURCES } from "@framer/schema";
import type { DbClient } from "../db/pool.js";

/**
 * Fixed catalog for the Assistant Benchmark. Every Scenario in `scenarios.ts`
 * is written against these exact ids, brands, and gaps — deterministic
 * inputs so a Scenario's expectations describe real, known-correct answers,
 * including the planted gaps that should produce a no-data reply.
 */

export const JENSON_DOMAIN = REFERENCE_SOURCES.find((source) => source.id === "jenson-usa")!.domains[0]!;
export const WORLDWIDE_DOMAIN = REFERENCE_SOURCES.find((source) => source.id === "worldwide-cyclery")!.domains[0]!;
export const COMPETITIVE_DOMAIN = REFERENCE_SOURCES.find((source) => source.id === "competitive-cyclist")!.domains[0]!;

// Products
export const FRAME_ALTITUDE = "10000000-0000-4000-8000-000000000001"; // Rocky Mountain Altitude, 2024, frame
export const FORK_36_PASS = "10000000-0000-4000-8000-000000000002"; // Fox 36 Factory, 2024, fork — fits Altitude
export const FORK_LYRIK_FAIL = "10000000-0000-4000-8000-000000000003"; // RockShox Lyrik Ultimate, 2024, fork — too much travel
export const STEM_AEFFECT = "10000000-0000-4000-8000-000000000004"; // RaceFace Aeffect R 40mm, cockpit — fits Altitude
export const STEM_ONEUP = "10000000-0000-4000-8000-000000000005"; // OneUp 35 50mm, cockpit — fits Altitude
export const VALVE_STEM_KIT = "10000000-0000-4000-8000-000000000006"; // tubeless valve stem kit — the "stem" ambiguity trap
export const WHEELSET_XM1700 = "10000000-0000-4000-8000-000000000007"; // DT Swiss XM 1700 SPLINE 29, wheelset

// Listings
export const LISTING_ALTITUDE_JENSON = "20000000-0000-4000-8000-000000000001";
export const LISTING_FORK36_JENSON = "20000000-0000-4000-8000-000000000002";
export const LISTING_FORK36_WORLDWIDE = "20000000-0000-4000-8000-000000000003";
export const LISTING_FORK36_INACTIVE = "20000000-0000-4000-8000-000000000004";
export const LISTING_LYRIK_COMPETITIVE = "20000000-0000-4000-8000-000000000005";
export const LISTING_STEM_AEFFECT_JENSON = "20000000-0000-4000-8000-000000000006";
export const LISTING_STEM_ONEUP_WORLDWIDE = "20000000-0000-4000-8000-000000000007";
export const LISTING_WHEELSET_JENSON_OOS = "20000000-0000-4000-8000-000000000008";
export const LISTING_FORK36_USED = "20000000-0000-4000-8000-000000000009"; // used marketplace, no siblings

// Watches
export const WATCH_ALTITUDE_PRODUCT = "30000000-0000-4000-8000-000000000001"; // Product-target
export const WATCH_FORK36_LISTING = "30000000-0000-4000-8000-000000000002"; // Listing-target

/** Planted gap: nothing in the catalog or reference registry answers this. */
export const GAP_BRAND = "Nukeproof";
export const GAP_MODEL = "Giga";
export const GAP_YEAR = 2019;

export async function seedAssistantBenchmarkCatalog(db: DbClient): Promise<void> {
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);

  await q(
    `insert into products (id, brand, model, model_year, category, specs) values
      ($1, 'Rocky Mountain', 'Altitude', 2024, 'frame', $2),
      ($3, 'Fox', '36 Factory', 2024, 'fork', $4),
      ($5, 'RockShox', 'Lyrik Ultimate', 2024, 'fork', $6),
      ($7, 'Raceface', 'Aeffect R 40mm', 2024, 'cockpit', $8),
      ($9, 'OneUp', '35 50mm', 2024, 'cockpit', $10),
      ($11, 'Park Tool', 'Tubeless Valve Stem Kit', 2024, 'other', '{}'),
      ($12, 'DT Swiss', 'XM 1700 SPLINE 29', 2024, 'wheelset', $13)`,
    [
      FRAME_ALTITUDE,
      JSON.stringify({
        maxForkTravelMm: 160,
        wheelSizeInches: 29,
        headTubeAngleDeg: 64.3,
        steererStandard: "tapered 1.5-1.125in",
      }),
      FORK_36_PASS,
      JSON.stringify({
        maxForkTravelMm: 160,
        steererStandard: "tapered 1.5-1.125in",
        steererDiameterMm: 1.5,
        axleStandard: "15x110mm Boost",
      }),
      FORK_LYRIK_FAIL,
      JSON.stringify({
        maxForkTravelMm: 180,
        steererStandard: "tapered 1.5-1.125in",
        steererDiameterMm: 1.5,
        axleStandard: "15x110mm Boost",
      }),
      STEM_AEFFECT,
      JSON.stringify({ steererStandard: "tapered 1.5-1.125in", steererDiameterMm: 1.5, barClampDiameterMm: 35 }),
      STEM_ONEUP,
      JSON.stringify({ steererStandard: "tapered 1.5-1.125in", steererDiameterMm: 1.5, barClampDiameterMm: 35 }),
      VALVE_STEM_KIT,
      WHEELSET_XM1700,
      JSON.stringify({ wheelSizeInches: 29, axleStandard: "15x110mm Boost" }),
    ]
  );

  await q(
    `insert into listings (id, product_id, url, domain, status, is_used, title, last_checked_at) values
      ($1, $2, 'https://${JENSON_DOMAIN}/rocky-mountain-altitude-2024', $3, 'active', 0, 'Rocky Mountain Altitude 2024', '2026-09-01T00:00:00Z'),
      ($4, $5, 'https://${JENSON_DOMAIN}/fox-36-factory', $3, 'active', 0, 'Fox 36 Factory', '2026-09-01T00:00:00Z'),
      ($6, $5, 'https://${WORLDWIDE_DOMAIN}/fox-36-factory', $7, 'active', 0, 'Fox 36 Factory', '2026-09-01T00:00:00Z'),
      ($8, $5, 'https://old.example.com/fox-36-factory', 'old.example.com', 'inactive', 0, 'Fox 36 Factory (old)', null),
      ($9, $10, 'https://${COMPETITIVE_DOMAIN}/rockshox-lyrik-ultimate', $11, 'active', 0, 'RockShox Lyrik Ultimate', '2026-09-01T00:00:00Z'),
      ($12, $13, 'https://${JENSON_DOMAIN}/raceface-aeffect-r-40mm', $3, 'active', 0, 'Raceface Aeffect R 40mm', '2026-09-01T00:00:00Z'),
      ($14, $15, 'https://${WORLDWIDE_DOMAIN}/oneup-35-50mm', $7, 'active', 0, 'OneUp 35 50mm', '2026-09-01T00:00:00Z'),
      ($16, $17, 'https://${JENSON_DOMAIN}/dt-swiss-xm-1700', $3, 'active', 0, 'DT Swiss XM 1700 SPLINE 29', '2026-09-01T00:00:00Z'),
      ($18, $5, 'https://pinkbike.example.com/buysell/fox-36-used', 'pinkbike.example.com', 'active', 1, 'Used Fox 36 Factory', null)`,
    [
      LISTING_ALTITUDE_JENSON,
      FRAME_ALTITUDE,
      JENSON_DOMAIN,
      LISTING_FORK36_JENSON,
      FORK_36_PASS,
      LISTING_FORK36_WORLDWIDE,
      WORLDWIDE_DOMAIN,
      LISTING_FORK36_INACTIVE,
      LISTING_LYRIK_COMPETITIVE,
      FORK_LYRIK_FAIL,
      COMPETITIVE_DOMAIN,
      LISTING_STEM_AEFFECT_JENSON,
      STEM_AEFFECT,
      LISTING_STEM_ONEUP_WORLDWIDE,
      STEM_ONEUP,
      LISTING_WHEELSET_JENSON_OOS,
      WHEELSET_XM1700,
      LISTING_FORK36_USED,
    ]
  );

  await q(
    `insert into price_points (id, listing_id, price, currency, in_stock, scraped_at) values
      ('ab1', $1, 3899, 'USD', 1, '2026-08-01T00:00:00Z'),
      ('ab2', $2, 899, 'USD', 1, '2026-08-01T00:00:00Z'),
      ('ab3', $2, 949, 'USD', 1, '2026-08-15T00:00:00Z'),
      ('ab4', $2, 899, 'USD', 1, '2026-09-01T00:00:00Z'),
      ('ab5', $3, 879, 'USD', 1, '2026-09-01T00:00:00Z'),
      ('ab6', $4, 750, 'USD', 1, '2026-07-01T00:00:00Z'),
      ('ab7', $5, 1099, 'USD', 1, '2026-09-01T00:00:00Z'),
      ('ab8', $6, 64, 'USD', 1, '2026-09-01T00:00:00Z'),
      ('ab9', $7, 79, 'USD', 1, '2026-09-01T00:00:00Z'),
      ('ab10', $8, 599.99, 'USD', 0, '2026-09-01T00:00:00Z'),
      ('ab11', $9, 550, 'USD', 1, '2026-08-01T00:00:00Z')`,
    [
      LISTING_ALTITUDE_JENSON,
      LISTING_FORK36_JENSON,
      LISTING_FORK36_WORLDWIDE,
      LISTING_FORK36_INACTIVE,
      LISTING_LYRIK_COMPETITIVE,
      LISTING_STEM_AEFFECT_JENSON,
      LISTING_STEM_ONEUP_WORLDWIDE,
      LISTING_WHEELSET_JENSON_OOS,
      LISTING_FORK36_USED,
    ]
  );

  await q(
    `insert into watches (id, owner_id, target_type, product_id, listing_id) values
      ($1, $2, 'product', $3, null),
      ($4, $2, 'listing', null, $5)`,
    [WATCH_ALTITUDE_PRODUCT, LOCAL_OWNER_ID, FRAME_ALTITUDE, WATCH_FORK36_LISTING, LISTING_FORK36_JENSON]
  );
}
