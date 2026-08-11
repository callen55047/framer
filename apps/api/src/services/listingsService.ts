import { newId, withTransaction } from "../db/pool.js";

const SCHEDULED_FAILURE_THRESHOLD = 3;

export async function persistPricePoint(
  listingId: string,
  input: {
    watchId?: string | null;
    productId: string | null;
    price: number;
    currency: string;
    inStock: boolean;
    scrapedAt: string;
    title: string;
  }
): Promise<{ pricePoint: Record<string, unknown>; listing: Record<string, unknown> }> {
  return withTransaction(async (client) => {
    const pricePointId = newId();
    const { rows: pricePointRows } = await client.query(
      `insert into price_points (id, listing_id, watch_id, price, currency, in_stock, scraped_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        pricePointId,
        listingId,
        input.watchId ?? null,
        input.price,
        input.currency,
        input.inStock ? 1 : 0,
        input.scrapedAt,
      ]
    );
    const { rows: listingRows } = await client.query(
      `update listings
       set product_id = coalesce(product_id, $2),
           title = $3,
           last_checked_at = $4,
           consecutive_scheduled_failures = 0,
           updated_at = datetime('now')
       where id = $1
       returning *`,
      [listingId, input.productId, input.title, input.scrapedAt]
    );
    if (!listingRows[0]) throw new Error("listing not found");
    return { pricePoint: pricePointRows[0]!, listing: listingRows[0]! };
  });
}

export async function markListingInactive(listingId: string): Promise<Record<string, unknown> | null> {
  const { rows } = await withTransaction(async (client) => {
    return client.query(
      `update listings
       set status = 'inactive',
           last_checked_at = datetime('now'),
           updated_at = datetime('now')
       where id = $1 and status = 'active'
       returning *`,
      [listingId]
    );
  });
  return rows[0] ?? null;
}

export async function recordScheduledFailure(
  listingId: string,
  options: { httpStatus?: number }
): Promise<{ listing: Record<string, unknown>; becameInactive: boolean } | null> {
  return withTransaction(async (client) => {
    const { rows: existing } = await client.query("select * from listings where id = $1", [listingId]);
    const listing = existing[0];
    if (!listing || listing.status !== "active") return null;

    if (options.httpStatus === 404) {
      const { rows } = await client.query(
        `update listings
         set status = 'inactive',
             last_checked_at = datetime('now'),
             updated_at = datetime('now')
         where id = $1
         returning *`,
        [listingId]
      );
      return { listing: rows[0]!, becameInactive: true };
    }

    const nextFailures = Number(listing.consecutive_scheduled_failures ?? 0) + 1;
    const becameInactive = nextFailures >= SCHEDULED_FAILURE_THRESHOLD;
    const { rows } = await client.query(
      `update listings
       set consecutive_scheduled_failures = $2,
           status = case when $3 = 1 then 'inactive' else status end,
           last_checked_at = datetime('now'),
           updated_at = datetime('now')
       where id = $1
       returning *`,
      [listingId, nextFailures, becameInactive ? 1 : 0]
    );
    return { listing: rows[0]!, becameInactive };
  });
}
