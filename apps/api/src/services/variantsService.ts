import {
  computeVariantAggregate,
  filterVariantsByDiscovery,
  MISSING_VARIANT_CONFIRMATION_THRESHOLD,
  type ExtractedVariant,
  type FrameSize,
  type VariantDiscoveryFilter,
  type WheelSizeInches,
} from "@framer/schema";
import { newId, withTransaction, type DbClient } from "../db/pool.js";

export interface ReconcileVariantSnapshotInput {
  productId: string | null;
  title: string;
  scrapedAt: string;
  variants: ExtractedVariant[];
  watchIds?: string[];
  discoveryFilter?: VariantDiscoveryFilter | null;
}

function parseOptionsJson(raw: string): { name: string; value: string }[] {
  try {
    const parsed = JSON.parse(raw) as { name: string; value: string }[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function reconcileVariantSnapshot(
  listingId: string,
  input: ReconcileVariantSnapshotInput
): Promise<void> {
  await withTransaction(async (client) => {
    const { rows: existingVariants } = await client.query(
      "select * from listing_variants where listing_id = $1",
      [listingId]
    );
    const existingByProvider = new Map(
      existingVariants.map((row) => [row.provider_id as string, row])
    );
    const seenProviderIds = new Set<string>();

    for (const variant of input.variants) {
      seenProviderIds.add(variant.providerId);
      const existing = existingByProvider.get(variant.providerId);
      const variantId = existing ? (existing.id as string) : newId();

      if (existing) {
        await client.query(
          `update listing_variants
           set label = $2,
               option_labels = $3,
               frame_size = $4,
               wheel_size_inches = $5,
               price = $6,
               currency = $7,
               in_stock = $8,
               missing_confirmations = 0,
               last_seen_at = $9,
               updated_at = datetime('now')
           where id = $1`,
          [
            variantId,
            variant.label,
            JSON.stringify(variant.options),
            variant.frameSize ?? null,
            variant.wheelSizeInches ?? null,
            variant.price,
            variant.currency,
            variant.inStock ? 1 : 0,
            input.scrapedAt,
          ]
        );
      } else {
        await client.query(
          `insert into listing_variants (
             id, listing_id, provider_id, label, option_labels, frame_size, wheel_size_inches,
             price, currency, in_stock, missing_confirmations, first_seen_at, last_seen_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $11)`,
          [
            variantId,
            listingId,
            variant.providerId,
            variant.label,
            JSON.stringify(variant.options),
            variant.frameSize ?? null,
            variant.wheelSizeInches ?? null,
            variant.price,
            variant.currency,
            variant.inStock ? 1 : 0,
            input.scrapedAt,
          ]
        );
      }

      await client.query(
        `insert into variant_price_points (id, variant_id, watch_id, price, currency, in_stock, scraped_at)
         values ($1, $2, null, $3, $4, $5, $6)`,
        [
          newId(),
          variantId,
          variant.price,
          variant.currency,
          variant.inStock ? 1 : 0,
          input.scrapedAt,
        ]
      );
    }

    for (const row of existingVariants) {
      const providerId = row.provider_id as string;
      if (seenProviderIds.has(providerId)) continue;

      const nextMissing = Number(row.missing_confirmations ?? 0) + 1;
      const markUnavailable = nextMissing >= MISSING_VARIANT_CONFIRMATION_THRESHOLD;
      await client.query(
        `update listing_variants
         set missing_confirmations = $2,
             in_stock = case when $3 = 1 then 0 else in_stock end,
             updated_at = datetime('now')
         where id = $1`,
        [row.id, nextMissing, markUnavailable ? 1 : 0]
      );
    }

    await client.query(
      `update listings
       set product_id = coalesce(product_id, $2),
           title = $3,
           last_checked_at = $4,
           consecutive_scheduled_failures = 0,
           updated_at = datetime('now')
       where id = $1`,
      [listingId, input.productId, input.title, input.scrapedAt]
    );

    const watchIds =
      input.watchIds?.length
        ? input.watchIds
        : (
            await client.query("select id from watches where listing_id = $1", [listingId])
          ).rows.map((row) => row.id as string);

    for (const watchId of watchIds) {
      const { rows: watchRows } = await client.query("select * from watches where id = $1", [watchId]);
      const watch = watchRows[0];
      if (!watch) continue;

      const discoveryFilter: VariantDiscoveryFilter | null =
        input.discoveryFilter ??
        (watch.frame_size || watch.wheel_size_inches
          ? {
              frameSize: (watch.frame_size as FrameSize | null) ?? undefined,
              wheelSizeInches: (watch.wheel_size_inches as WheelSizeInches | null) ?? undefined,
            }
          : null);

      const filteredVariants = filterVariantsByDiscovery(input.variants, discoveryFilter);
      const variantSelection = watch.variant_selection ?? "all";
      const listingVariantId = watch.listing_variant_id as string | null;

      let headlinePrice: number;
      let headlineCurrency: string;
      let headlineInStock: boolean;

      if (variantSelection === "specific" && listingVariantId) {
        const { rows: pinnedRows } = await client.query(
          "select * from listing_variants where id = $1 and listing_id = $2",
          [listingVariantId, listingId]
        );
        const pinned = pinnedRows[0];
        if (pinned) {
          headlinePrice = Number(pinned.price);
          headlineCurrency = pinned.currency as string;
          headlineInStock = pinned.in_stock === 1;
        } else {
          const aggregate = computeVariantAggregate(filteredVariants);
          headlinePrice = aggregate.price ?? filteredVariants[0]?.price ?? 0;
          headlineCurrency = aggregate.currency ?? filteredVariants[0]?.currency ?? "USD";
          headlineInStock = false;
        }
      } else {
        const aggregate = computeVariantAggregate(filteredVariants);
        headlinePrice = aggregate.price ?? filteredVariants[0]?.price ?? 0;
        headlineCurrency = aggregate.currency ?? filteredVariants[0]?.currency ?? "USD";
        headlineInStock = aggregate.inStock;
      }

      await client.query(
        `insert into price_points (id, listing_id, watch_id, price, currency, in_stock, scraped_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newId(),
          listingId,
          watchId,
          headlinePrice,
          headlineCurrency,
          headlineInStock ? 1 : 0,
          input.scrapedAt,
        ]
      );

      if (variantSelection === "specific" && listingVariantId) {
        const { rows: pinnedRows } = await client.query(
          "select * from listing_variants where id = $1",
          [listingVariantId]
        );
        const pinned = pinnedRows[0];
        if (pinned) {
          await client.query(
            `insert into variant_price_points (id, variant_id, watch_id, price, currency, in_stock, scraped_at)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [
              newId(),
              pinned.id,
              watchId,
              Number(pinned.price),
              pinned.currency,
              pinned.in_stock,
              input.scrapedAt,
            ]
          );
        }
      }
    }
  });
}

export async function listListingVariants(listingId: string) {
  const { rows } = await withTransaction(async (client) => {
    return client.query(
      "select * from listing_variants where listing_id = $1 order by label asc",
      [listingId]
    );
  });
  return rows.map((row) => ({
    id: row.id,
    listingId: row.listing_id,
    providerId: row.provider_id,
    label: row.label,
    options: parseOptionsJson(row.option_labels as string),
    frameSize: row.frame_size ?? null,
    wheelSizeInches: row.wheel_size_inches ?? null,
    price: Number(row.price),
    currency: row.currency,
    inStock: row.in_stock === 1,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function computeWatchVariantSummary(
  client: DbClient,
  watch: Record<string, unknown>,
  listingId: string
) {
  const { rows: variantRows } = await client.query(
    "select * from listing_variants where listing_id = $1 order by label asc",
    [listingId]
  );

  const discoveryFilter: VariantDiscoveryFilter | null =
    watch.frame_size || watch.wheel_size_inches
      ? {
          frameSize: (watch.frame_size as FrameSize | null) ?? undefined,
          wheelSizeInches: (watch.wheel_size_inches as WheelSizeInches | null) ?? undefined,
        }
      : null;

  const variants: ExtractedVariant[] = variantRows.map((row) => ({
    providerId: row.provider_id as string,
    label: row.label as string,
    options: parseOptionsJson(row.option_labels as string),
    frameSize: (row.frame_size as FrameSize | null) ?? undefined,
    wheelSizeInches: (row.wheel_size_inches as WheelSizeInches | null) ?? undefined,
    price: Number(row.price),
    currency: row.currency as string,
    inStock: row.in_stock === 1,
  }));

  const filtered = filterVariantsByDiscovery(variants, discoveryFilter);
  const aggregate = computeVariantAggregate(filtered);
  const variantSelection = (watch.variant_selection as string) ?? "all";
  const listingVariantId = watch.listing_variant_id as string | null;

  let pinnedLabel: string | null = null;
  let price = aggregate.price;
  let inStock = aggregate.inStock;
  let scrapedAt: string | null = null;

  if (variantSelection === "specific" && listingVariantId) {
    const pinned = variantRows.find((row) => row.id === listingVariantId);
    if (pinned) {
      pinnedLabel = pinned.label as string;
      price = Number(pinned.price);
      inStock = pinned.in_stock === 1;
      scrapedAt = pinned.last_seen_at as string;
    } else {
      inStock = false;
    }
  }

  const { rows: latestWatchPoint } = await client.query(
    "select scraped_at from price_points where watch_id = $1 order by scraped_at desc limit 1",
    [watch.id]
  );
  if (!scrapedAt && latestWatchPoint[0]) {
    scrapedAt = latestWatchPoint[0].scraped_at as string;
  }

  return {
    variantSelection,
    pinnedVariantId: listingVariantId,
    pinnedLabel,
    lowestInStockPrice: aggregate.lowestInStockPrice,
    highestInStockPrice: aggregate.highestInStockPrice,
    availableCount: aggregate.availableCount,
    totalCount: filtered.length,
    currency: aggregate.currency,
    price,
    inStock,
    scrapedAt,
  };
}
