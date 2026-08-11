import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";

async function withTestDb<T>(fn: (listingId: string) => Promise<T>): Promise<T> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "framer-listings-test-"));
  process.env.DATABASE_PATH = path.join(dataDir, "framer.db");
  process.env.RUNNER_ENABLED = "false";
  vi.resetModules();

  const { runMigrations } = await import("../db/migrate.js");
  const { pool, newId } = await import("../db/pool.js");
  await runMigrations();

  const listingId = newId();
  await pool.query(
    `insert into listings (id, url, domain, source, status)
     values ($1, $2, $3, 'scrape', 'active')`,
    [listingId, "https://example.com/item", "example.com"]
  );

  try {
    return await fn(listingId);
  } finally {
    await pool.end();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

describe("markListingInactive", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("marks an active listing inactive", async () => {
    await withTestDb(async (listingId) => {
      const { markListingInactive } = await import("./listingsService.js");
      const listing = await markListingInactive(listingId);
      expect(listing?.status).toBe("inactive");
    });
  });
});

describe("recordScheduledFailure", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("marks inactive immediately on 404", async () => {
    await withTestDb(async (listingId) => {
      const { recordScheduledFailure } = await import("./listingsService.js");
      const result = await recordScheduledFailure(listingId, { httpStatus: 404 });
      expect(result?.becameInactive).toBe(true);
      expect(result?.listing.status).toBe("inactive");
    });
  });

  it("increments failures and marks inactive after three non-404 failures", async () => {
    await withTestDb(async (listingId) => {
      const { recordScheduledFailure } = await import("./listingsService.js");
      const first = await recordScheduledFailure(listingId, {});
      expect(first?.becameInactive).toBe(false);
      expect(first?.listing.consecutive_scheduled_failures).toBe(1);

      const second = await recordScheduledFailure(listingId, {});
      expect(second?.becameInactive).toBe(false);
      expect(second?.listing.consecutive_scheduled_failures).toBe(2);

      const third = await recordScheduledFailure(listingId, {});
      expect(third?.becameInactive).toBe(true);
      expect(third?.listing.status).toBe("inactive");
    });
  });
});
