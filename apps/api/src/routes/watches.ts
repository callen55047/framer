import { Router } from "express";
import {
  CreateWatchInputSchema,
  LOCAL_OWNER_ID,
  UpdateWatchInputSchema,
  UpdateWatchVariantInputSchema,
  findReferenceSourceByUrl,
  toMatchedReferenceSource,
  type ListingItemKind,
  type FrameSize,
  type ProductCategory,
  type WheelSizeInches,
} from "@framer/schema";
import { newId, pool, withTransaction, type DbClient } from "../db/pool.js";
import { mapListing, mapListingVariant, mapPricePoint, mapTask, mapWatch } from "../lib/mappers.js";
import { computeWatchVariantSummary, listListingVariants } from "../services/variantsService.js";

export const watchesRouter = Router();

function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

interface RefreshJobInput {
  listingId: string;
  url: string;
  itemKind: ListingItemKind;
  expectedCategory: ProductCategory | null;
  watchIds?: string[];
  discoveryFilter?: { frameSize?: string; wheelSizeInches?: string } | null;
}

async function enqueueRefresh(
  client: DbClient,
  input: RefreshJobInput,
  origin: "user" | "sweep" = "user"
) {
  const taskId = newId();
  const { rows: taskRows } = await client.query(
    `insert into tasks (id, owner_id, kind, label, status, origin)
     values ($1, $2, 'RefreshListing', $3, 'queued', $4)
     returning *`,
    [taskId, LOCAL_OWNER_ID, `Refresh: ${input.url}`, origin]
  );
  const task = taskRows[0]!;
  const jobId = newId();
  await client.query(
    `insert into jobs (id, task_id, kind, status, input)
     values ($1, $2, 'RefreshListing', 'queued', $3)`,
    [
      jobId,
      task.id,
      JSON.stringify({
        listingId: input.listingId,
        url: input.url,
        itemKind: input.itemKind,
        expectedCategory: input.expectedCategory,
        watchIds: input.watchIds,
        discoveryFilter: input.discoveryFilter ?? null,
        taskOrigin: origin,
      }),
    ]
  );
  return task;
}

watchesRouter.post("/", async (req, res) => {
  const parsed = CreateWatchInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { url, displayTitle, itemKind, category, frameSize, wheelSizeInches } = parsed.data;
  const matchedSource = findReferenceSourceByUrl(url);
  const expectedCategory = itemKind === "component" ? (category ?? null) : null;
  const titleSource = displayTitle ? "user" : "auto";
  const discoveryFilter =
    frameSize || wheelSizeInches
      ? { frameSize: frameSize ?? undefined, wheelSizeInches: wheelSizeInches ?? undefined }
      : null;

  const result = await withTransaction(async (client) => {
    const { rows: existingListing } = await client.query("select * from listings where url = $1", [url]);
    let listing = existingListing[0];
    if (!listing) {
      const listingId = newId();
      const { rows } = await client.query(
        `insert into listings (id, url, domain, source, item_kind, expected_category)
         values ($1, $2, $3, 'scrape', $4, $5)
         returning *`,
        [listingId, url, domainOf(url), itemKind, expectedCategory]
      );
      listing = rows[0]!;
    } else if (listing.status === "active") {
      await client.query(
        `update listings
         set item_kind = $2, expected_category = $3, updated_at = datetime('now')
         where id = $1`,
        [listing.id, itemKind, expectedCategory]
      );
      listing = { ...listing, item_kind: itemKind, expected_category: expectedCategory };
    }

    const { rows: existingWatch } = await client.query(
      "select * from watches where owner_id = $1 and listing_id = $2",
      [LOCAL_OWNER_ID, listing.id]
    );
    let watch = existingWatch[0];
    if (!watch) {
      const watchId = newId();
      const { rows } = await client.query(
        `insert into watches (
           id, owner_id, target_type, listing_id, display_title, title_source,
           frame_size, wheel_size_inches, variant_selection, listing_variant_id
         )
         values ($1, $2, 'listing', $3, $4, $5, $6, $7, 'all', null)
         returning *`,
        [
          watchId,
          LOCAL_OWNER_ID,
          listing.id,
          displayTitle ?? null,
          titleSource,
          frameSize ?? null,
          wheelSizeInches ?? null,
        ]
      );
      watch = rows[0]!;
    } else {
      const { rows } = await client.query(
        `update watches
         set display_title = coalesce($2, display_title),
             title_source = case when $2 is not null then $3 else title_source end,
             frame_size = $4,
             wheel_size_inches = $5
         where id = $1
         returning *`,
        [watch.id, displayTitle ?? null, titleSource, frameSize ?? null, wheelSizeInches ?? null]
      );
      watch = rows[0]!;
    }

    let task = null;
    if (listing.status === "active") {
      task = await enqueueRefresh(
        client,
        {
          listingId: listing.id as string,
          url,
          itemKind: (listing.item_kind as ListingItemKind) ?? itemKind,
          expectedCategory: (listing.expected_category as ProductCategory | null) ?? expectedCategory,
          watchIds: [watch.id as string],
          discoveryFilter,
        },
        "user"
      );
    }
    return { watch, listing, task };
  });

  res.status(201).json({
    watch: mapWatch(result.watch),
    listing: mapListing(result.listing),
    task: result.task ? mapTask(result.task) : null,
    matchedSource: matchedSource ? toMatchedReferenceSource(matchedSource) : null,
  });
});

watchesRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `select
       w.*,
       l.id as listing_id_full, l.product_id, l.url, l.domain, l.source, l.status as listing_status,
       l.consecutive_scheduled_failures,
       l.item_kind, l.expected_category,
       l.title, l.last_checked_at,
       p.brand, p.model, p.model_year,
       pp.price as latest_price, pp.currency as latest_currency, pp.in_stock as latest_in_stock,
       pp.scraped_at as latest_scraped_at,
       t.status as latest_task_status, t.id as latest_task_id,
       j.error as latest_job_error
     from watches w
     left join listings l on l.id = w.listing_id
     left join products p on p.id = l.product_id
     left join price_points pp on pp.id = (
       select id from price_points where watch_id = w.id order by scraped_at desc limit 1
     )
     left join tasks t on t.id = (
       select t2.id from tasks t2
       join jobs j2 on j2.task_id = t2.id
       where json_extract(j2.input, '$.listingId') = l.id
       order by t2.created_at desc limit 1
     )
     left join jobs j on j.task_id = t.id and j.id = (
       select j3.id from jobs j3 where j3.task_id = t.id order by j3.created_at desc limit 1
     )
     where w.owner_id = $1
     order by w.created_at desc`,
    [LOCAL_OWNER_ID]
  );

  const watches = await withTransaction(async (client) =>
    Promise.all(
      rows.map(async (row) => {
        const variantSummary =
          row.listing_id_full
            ? await computeWatchVariantSummary(client, row, row.listing_id_full as string)
            : null;

        return {
          ...mapWatch(row),
          listing: row.listing_id_full
            ? {
                ...mapListing({
                  id: row.listing_id_full,
                  product_id: row.product_id,
                  url: row.url,
                  domain: row.domain,
                  source: row.source,
                  status: row.listing_status,
                  consecutive_scheduled_failures: row.consecutive_scheduled_failures,
                  item_kind: row.item_kind,
                  expected_category: row.expected_category,
                  title: row.title,
                  last_checked_at: row.last_checked_at,
                  created_at: row.created_at,
                  updated_at: row.created_at,
                }),
                product: row.brand ? { brand: row.brand, model: row.model, modelYear: row.model_year } : null,
              }
            : null,
          latestPrice: row.latest_price
            ? mapPricePoint({
                id: null,
                listing_id: row.listing_id_full,
                watch_id: row.id,
                price: row.latest_price,
                currency: row.latest_currency,
                in_stock: row.latest_in_stock,
                scraped_at: row.latest_scraped_at,
              })
            : null,
          variantSummary,
          latestTask: row.latest_task_id
            ? { id: row.latest_task_id, status: row.latest_task_status, error: row.latest_job_error ?? null }
            : null,
        };
      })
    )
  );

  res.json({ watches });
});

watchesRouter.get("/:id/variants", async (req, res) => {
  const { rows: watchRows } = await pool.query(
    "select listing_id from watches where id = $1 and owner_id = $2",
    [req.params.id, LOCAL_OWNER_ID]
  );
  const watch = watchRows[0];
  if (!watch) return res.status(404).json({ error: "watch not found" });

  const variants = await listListingVariants(watch.listing_id as string);
  res.json({
    variants: variants.map((variant) =>
      mapListingVariant({
        id: variant.id,
        listing_id: variant.listingId,
        provider_id: variant.providerId,
        label: variant.label,
        option_labels: JSON.stringify(variant.options),
        frame_size: variant.frameSize,
        wheel_size_inches: variant.wheelSizeInches,
        price: variant.price,
        currency: variant.currency,
        in_stock: variant.inStock ? 1 : 0,
        first_seen_at: variant.firstSeenAt,
        last_seen_at: variant.lastSeenAt,
      })
    ),
  });
});

watchesRouter.get("/:id/price-points", async (req, res) => {
  const { rows: watchRows } = await pool.query(
    "select * from watches where id = $1 and owner_id = $2",
    [req.params.id, LOCAL_OWNER_ID]
  );
  const watch = watchRows[0];
  if (!watch) return res.status(404).json({ error: "watch not found" });

  if (watch.variant_selection === "specific" && watch.listing_variant_id) {
    const { rows } = await pool.query(
      `select vpp.*, lv.listing_id
       from variant_price_points vpp
       join listing_variants lv on lv.id = vpp.variant_id
       where vpp.watch_id = $1
       order by vpp.scraped_at asc`,
      [req.params.id]
    );
    res.json({
      pricePoints: rows.map((row) =>
        mapPricePoint({
          id: row.id,
          listing_id: row.listing_id,
          watch_id: row.watch_id,
          price: row.price,
          currency: row.currency,
          in_stock: row.in_stock,
          scraped_at: row.scraped_at,
        })
      ),
    });
    return;
  }

  const { rows } = await pool.query(
    "select * from price_points where watch_id = $1 order by scraped_at asc",
    [req.params.id]
  );
  res.json({ pricePoints: rows.map(mapPricePoint) });
});

watchesRouter.patch("/:id", async (req, res) => {
  const parsed = UpdateWatchInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows } = await pool.query(
    `update watches
     set display_title = $2, title_source = 'user'
     where id = $1 and owner_id = $3
     returning *`,
    [req.params.id, parsed.data.displayTitle, LOCAL_OWNER_ID]
  );
  if (!rows[0]) return res.status(404).json({ error: "watch not found" });
  res.json({ watch: mapWatch(rows[0]) });
});

watchesRouter.patch("/:id/variant", async (req, res) => {
  const parsed = UpdateWatchVariantInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await withTransaction(async (client) => {
    const { rows: watchRows } = await client.query(
      "select * from watches where id = $1 and owner_id = $2",
      [req.params.id, LOCAL_OWNER_ID]
    );
    const watch = watchRows[0];
    if (!watch) return null;

    if (parsed.data.variantSelection === "specific") {
      const { rows: variantRows } = await client.query(
        "select id from listing_variants where id = $1 and listing_id = $2",
        [parsed.data.listingVariantId, watch.listing_id]
      );
      if (!variantRows[0]) {
        return { error: "variant not found for this listing" as const };
      }
    }

    const listingVariantId =
      parsed.data.variantSelection === "specific" ? parsed.data.listingVariantId : null;

    const { rows } = await client.query(
      `update watches
       set variant_selection = $2,
           listing_variant_id = $3
       where id = $1
       returning *`,
      [watch.id, parsed.data.variantSelection, listingVariantId ?? null]
    );

    const variantSummary = await computeWatchVariantSummary(
      client,
      rows[0]!,
      watch.listing_id as string
    );

    return { watch: mapWatch(rows[0]!), variantSummary };
  });

  if (!result) return res.status(404).json({ error: "watch not found" });
  if ("error" in result) return res.status(400).json({ error: result.error });
  res.json(result);
});

watchesRouter.delete("/:id", async (req, res) => {
  const { rows } = await pool.query(
    "delete from watches where id = $1 and owner_id = $2 returning id",
    [req.params.id, LOCAL_OWNER_ID]
  );
  if (rows.length === 0) return res.status(404).json({ error: "watch not found" });
  res.status(204).send();
});

watchesRouter.post("/:id/refresh", async (req, res) => {
  const { rows } = await pool.query("select * from watches where id = $1 and owner_id = $2", [
    req.params.id,
    LOCAL_OWNER_ID,
  ]);
  const watch = rows[0];
  if (!watch) return res.status(404).json({ error: "watch not found" });
  if (watch.target_type !== "listing") {
    return res.status(400).json({ error: "only listing-targeted watches support manual refresh in v1" });
  }

  const { rows: listingRows } = await pool.query("select * from listings where id = $1", [watch.listing_id]);
  const listing = listingRows[0];
  if (!listing) return res.status(404).json({ error: "listing not found" });
  if (listing.status === "inactive") {
    return res.status(400).json({ error: "inactive listings cannot be refreshed" });
  }
  if (listing.status === "unsupported") {
    return res.status(400).json({ error: "unsupported listings cannot be refreshed" });
  }

  const discoveryFilter =
    watch.frame_size || watch.wheel_size_inches
      ? {
          frameSize: (watch.frame_size as FrameSize | null) ?? undefined,
          wheelSizeInches: (watch.wheel_size_inches as WheelSizeInches | null) ?? undefined,
        }
      : null;

  const task = await withTransaction((client) =>
    enqueueRefresh(
      client,
      {
        listingId: listing.id as string,
        url: listing.url as string,
        itemKind: (listing.item_kind as ListingItemKind) ?? "component",
        expectedCategory: (listing.expected_category as ProductCategory | null) ?? null,
        watchIds: [watch.id as string],
        discoveryFilter,
      },
      "user"
    )
  );
  res.status(201).json({ task: mapTask(task) });
});
