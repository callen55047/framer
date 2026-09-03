import {
  BUILD_SLOT_TO_CATEGORY,
  BuildSlotSchema,
  CLARIFYING_QUESTION_TOOL_NAME,
  LOCAL_OWNER_ID,
  ProductCategorySchema,
  ReferenceSourceCategorySchema,
  SPEC_FIELD_LABELS,
  findReferenceSourceByDomain,
  getHandbookEntryBySpecKey,
  loadHandbookEntryWithProse,
  handbookAnnotationId,
  handbookDiagramId,
  handbookIllustrationPublicPath,
  type ProductCategory,
  type Spec,
} from "@framer/schema";
import type { ChatTool } from "@framer/runner/inference/types.js";
import {
  fetchCatalogReferencePage,
  searchReferenceCategory,
} from "@framer/runner/lib/referenceSearch.js";
import { dbClient } from "../db/client.js";
import { pool } from "../db/pool.js";
import { createTaskWithLinearJobs } from "./createTaskChain.js";
import {
  checkCompatibility,
  findCompatibleProducts,
  parseProductSpecs,
  type CompatibilityProduct,
} from "./compatibilityRules.js";
import { mapListing, mapPricePoint, mapProduct, mapTask, mapWatch, toIso } from "./mappers.js";
import { deriveProductPrice, listProductListings } from "../services/productListingsService.js";
import { computeWatchVariantSummary } from "../services/variantsService.js";

const REFERENCE_CATEGORY_ENUM = ReferenceSourceCategorySchema.options.filter((category) =>
  (["manufacturer_specs", "technical_reference", "component_database", "bike_specs", "tire_testing", "news_reviews", "product_testing"] as readonly string[]).includes(
    category
  )
);

export const CHAT_TOOLS: ChatTool[] = [
  {
    name: "listWatches",
    description: "List the owner's watches with latest price, listing status, and task status.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "listTasks",
    description: "List recent background tasks and their rollup status.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max tasks to return (default 20)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "searchProducts",
    description:
      "Search the catalog by brand/model text and/or category/year. Returns Products with listing counts and the cheapest live price — use this first for any \"how much is X\" question.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Brand or model search text (substring match)" },
        category: {
          type: "string",
          enum: ProductCategorySchema.options,
          description: "Restrict to one product category",
        },
        modelYear: { type: "integer", minimum: 1990, maximum: 2100, description: "Restrict to one model year" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max products to return (default 10)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "getProductListings",
    description:
      "Every retailer Listing for one Product with latest price, stock, and the derived Product price (cheapest in-stock new Listing). Resolve the Product by id or by brand/model text.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Product UUID from searchProducts" },
        brand: { type: "string", description: "Brand to search if productId omitted" },
        model: { type: "string", description: "Model to search if productId omitted" },
        query: { type: "string", description: "Free-text brand/model search if productId omitted" },
        inStockOnly: { type: "boolean", description: "Only return active, in-stock Listings (default false)" },
        includeUsed: { type: "boolean", description: "Include used-marketplace Listings (default true)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "getPriceHistory",
    description:
      "Price history for one Listing (listingId) or one of the user's Watches (watchId). Returns chronological points plus min/max/latest summary. Price history belongs to Listings, not Products.",
    parameters: {
      type: "object",
      properties: {
        listingId: { type: "string", description: "Listing UUID" },
        watchId: { type: "string", description: "Watch UUID from listWatches" },
        since: { type: "string", description: "ISO date; only points at or after this moment" },
        limit: { type: "integer", minimum: 1, maximum: 365, description: "Max points, newest kept (default 60)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "listRetailers",
    description: "List every retailer domain in the catalog with listing counts and reference-source names.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "getListing",
    description: "Fetch one listing by id or URL.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Listing UUID" },
        url: { type: "string", description: "Listing URL" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "searchReference",
    description:
      "Search registered MTB reference sites for a topic. Returns ranked page links — follow up with fetchReferencePage on the best URLs.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: REFERENCE_CATEGORY_ENUM,
          description: "Reference source category to search",
        },
        query: { type: "string", description: "Search query (bike name, component, compatibility topic)" },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Max result links (default 5)" },
      },
      required: ["category", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "fetchReferencePage",
    description:
      "Fetch one allowlisted reference page by URL and return structure-preserving text (tables kept). Cite the source in your answer.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL from searchReference results" },
        section: {
          type: "string",
          description: "Optional section keyword to focus excerpt (e.g. geometry, compatibility)",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "checkCompatibility",
    description:
      "Evaluate Compatibility Rules between two Products using grounded Specs in the database. Returns deterministic pass/fail/unknown — not a model opinion.",
    parameters: {
      type: "object",
      properties: {
        productAId: { type: "string", description: "Product UUID for the first part" },
        productBId: { type: "string", description: "Product UUID for the second part" },
        productABrand: { type: "string", description: "Brand to search if productAId omitted" },
        productAModel: { type: "string", description: "Model to search if productAId omitted" },
        productBBrand: { type: "string", description: "Brand to search if productBId omitted" },
        productBModel: { type: "string", description: "Model to search if productBId omitted" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "findCompatibleProducts",
    description:
      "Find catalog products compatible with a bike/frame product for a build slot (e.g. cockpit for stems). Uses grounded Specs — never asks the user for UUIDs.",
    parameters: {
      type: "object",
      properties: {
        forProductId: { type: "string", description: "Product UUID of the bike or frame" },
        forBrand: { type: "string", description: "Brand if forProductId omitted" },
        forModel: { type: "string", description: "Model if forProductId omitted" },
        slot: {
          type: "string",
          enum: ["frame", "fork", "wheelset", "drivetrain", "brakes", "cockpit", "tires"],
          description: "Build slot to find parts for",
        },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Max matches (default 10)" },
      },
      required: ["slot"],
      additionalProperties: false,
    },
  },
  {
    name: "enqueueResearch",
    description:
      "Enqueue a background ResearchQuestion job when in-chat reference search cannot answer. Creates a Task the user can track.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The user's research question verbatim" },
        targetProductId: { type: "string", description: "Optional product to attach extracted Specs to" },
        categories: {
          type: "array",
          items: { type: "string", enum: REFERENCE_CATEGORY_ENUM },
          description: "Optional reference categories to search",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "listSessionSummaries",
    description:
      "List recent Assistant Sessions that have a settled Session Summary, excluding the current Session. Use before getSessionSummary to find a relevant past Session.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max sessions to return (default 20)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "getSessionSummary",
    description:
      "Retrieve the Session Summary for any Assistant Session by id. Defaults to the current Session when sessionId is omitted.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Assistant Session id (defaults to current session)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "getHandbookEntry",
    description:
      "Retrieve a Handbook entry — rider-facing definitions for MTB measurements, fitment standards, and concepts. Use before explaining geometry or compatibility terms.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Handbook entry slug (e.g. head-tube-angle, bb-drop, boost-spacing)" },
        specKey: {
          type: "string",
          description: "Alternative lookup by SpecSchema key (e.g. headTubeAngleDeg) when slug is unknown",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: CLARIFYING_QUESTION_TOOL_NAME,
    description:
      "Ask the user ONE short question when the answer depends on missing info (bike size, year, wheel config, budget, use-case) that no tool can resolve. Ends your turn. Give 2-4 concrete options.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The single question to ask, in your own voice" },
        options: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 4,
          description: "2-4 short concrete answers the user can tap",
        },
        allowFreeText: { type: "boolean", description: "Whether a typed answer is also fine (default true)" },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
];

const WATCH_LIST_QUERY = `select
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
order by w.created_at desc`;

export interface ChatToolContext {
  sessionId: string;
}

export async function executeChatTool(
  name: string,
  args: Record<string, unknown>,
  context: ChatToolContext
): Promise<unknown> {
  switch (name) {
    case "listWatches":
      return listWatchesTool();
    case "listTasks":
      return listTasksTool(args);
    case "searchProducts":
      return searchProductsTool(args);
    case "getListing":
      return getListingTool(args);
    case "getProductListings":
      return getProductListingsTool(args);
    case "getPriceHistory":
      return getPriceHistoryTool(args);
    case "listRetailers":
      return listRetailersTool();
    case CLARIFYING_QUESTION_TOOL_NAME:
      // Valid clarifications are intercepted by chatService and end the turn.
      // Reaching this means the arguments failed validation.
      throw new Error(
        `${CLARIFYING_QUESTION_TOOL_NAME} requires a non-empty question and, if given, 2-4 short options`
      );
    case "searchReference":
      return searchReferenceTool(args);
    case "fetchReferencePage":
      return fetchReferencePageTool(args);
    case "checkCompatibility":
      return checkCompatibilityTool(args);
    case "findCompatibleProducts":
      return findCompatibleProductsTool(args);
    case "enqueueResearch":
      return enqueueResearchTool(args, context);
    case "listSessionSummaries":
      return listSessionSummariesTool(args, context);
    case "getSessionSummary":
      return getSessionSummaryTool(args, context);
    case "getHandbookEntry":
      return getHandbookEntryTool(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function listWatchesTool() {
  const { rows } = await pool.query(WATCH_LIST_QUERY, [LOCAL_OWNER_ID]);
  return Promise.all(
    rows.map(async (row) => {
      const variantSummary =
        row.listing_id_full
          ? await computeWatchVariantSummary(dbClient, row, row.listing_id_full as string)
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
          ? {
              price: row.latest_price,
              currency: row.latest_currency,
              inStock: row.latest_in_stock === 1,
              scrapedAt: row.latest_scraped_at,
            }
          : null,
        variantSummary,
        latestTask: row.latest_task_id
          ? { id: row.latest_task_id, status: row.latest_task_status, error: row.latest_job_error ?? null }
          : null,
      };
    })
  );
}

async function listTasksTool(args: Record<string, unknown>) {
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  const { rows } = await pool.query(
    `select
       t.*,
       sum(case when j.status = 'queued' then 1 else 0 end) as queued_count,
       sum(case when j.status = 'leased' then 1 else 0 end) as leased_count,
       sum(case when j.status = 'succeeded' then 1 else 0 end) as succeeded_count,
       sum(case when j.status = 'failed' then 1 else 0 end) as failed_count,
       sum(case when j.status = 'cancelled' then 1 else 0 end) as cancelled_count
     from tasks t
     left join jobs j on j.task_id = t.id
     where t.owner_id = $1 and t.origin = 'user'
     group by t.id
     order by t.created_at desc
     limit $2`,
    [LOCAL_OWNER_ID, limit]
  );
  return rows.map((row) => ({
    ...mapTask(row),
    jobCounts: {
      queued: Number(row.queued_count),
      leased: Number(row.leased_count),
      succeeded: Number(row.succeeded_count),
      failed: Number(row.failed_count),
      cancelled: Number(row.cancelled_count),
    },
  }));
}

async function searchProductsTool(args: Record<string, unknown>) {
  const query = String(args.query ?? "").trim();
  const categoryParsed = ProductCategorySchema.safeParse(args.category);
  const category = categoryParsed.success ? categoryParsed.data : null;
  if (args.category !== undefined && !categoryParsed.success) {
    throw new Error(`Unknown category "${String(args.category)}". Use one of: ${ProductCategorySchema.options.join(", ")}`);
  }
  const modelYear = Number.isInteger(Number(args.modelYear)) && args.modelYear !== undefined ? Number(args.modelYear) : null;
  if (!query && !category) {
    throw new Error("searchProducts needs a query or a category");
  }
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const pattern = query ? `%${query.toLowerCase()}%` : null;
  const { rows } = await pool.query(
    `select * from products
     where ($1 is null or lower(brand) like $1 or lower(model) like $1 or lower(brand || ' ' || model) like $1)
       and ($2 is null or category = $2)
       and ($3 is null or model_year = $3)
     order by updated_at desc
     limit $4`,
    [pattern, category, modelYear, limit]
  );
  const listingsByProduct = await listProductListings(rows.map((row) => row.id as string));
  return rows.map((row) => {
    const listings = listingsByProduct.get(row.id as string) ?? [];
    return {
      ...mapProduct(row),
      specs: parseProductSpecs(row.specs),
      listingCount: listings.length,
      activeListingCount: listings.filter((listing) => listing.status === "active").length,
      cheapestLive: deriveProductPrice(listings),
    };
  });
}

async function getProductListingsTool(args: Record<string, unknown>) {
  const { row, otherMatches } = await resolveProductRow({
    productId: typeof args.productId === "string" ? args.productId : undefined,
    brand: typeof args.brand === "string" ? args.brand : undefined,
    model: typeof args.model === "string" ? args.model : undefined,
    query: typeof args.query === "string" ? args.query : undefined,
    label: "product",
  });
  const inStockOnly = args.inStockOnly === true;
  const includeUsed = args.includeUsed !== false;

  const productId = row.id as string;
  const all = (await listProductListings([productId])).get(productId) ?? [];
  // "In stock" only means anything for a Listing that is still active.
  const listings = all.filter(
    (listing) =>
      (!inStockOnly || (listing.inStock && listing.status === "active")) && (includeUsed || !listing.isUsed)
  );

  return {
    product: { ...mapProduct(row), specs: parseProductSpecs(row.specs) },
    otherMatches,
    derivedPrice: deriveProductPrice(all),
    listingCount: all.length,
    listings,
  };
}

async function getPriceHistoryTool(args: Record<string, unknown>) {
  const listingId = typeof args.listingId === "string" && args.listingId.trim() ? args.listingId.trim() : null;
  const watchId = typeof args.watchId === "string" && args.watchId.trim() ? args.watchId.trim() : null;
  if ((listingId && watchId) || (!listingId && !watchId)) {
    throw new Error("getPriceHistory needs exactly one of listingId or watchId");
  }
  const since = typeof args.since === "string" && !Number.isNaN(Date.parse(args.since)) ? new Date(args.since).toISOString() : null;
  const limit = Math.min(Math.max(Number(args.limit) || 60, 1), 365);
  // SQLite stores scraped_at as ISO text; compare on a normalized form so both "T" and " " separators sort.
  const sinceClause = since ? `and replace(scraped_at, ' ', 'T') >= $2` : "";
  const params: unknown[] = since ? [null, since, limit + 1] : [null, limit + 1];
  const limitParam = since ? "$3" : "$2";

  let rows: Record<string, unknown>[] = [];
  let target: Record<string, unknown>;

  if (watchId) {
    const { rows: watchRows } = await pool.query(
      `select w.*, l.domain, l.title, l.url, p.brand, p.model, p.model_year, lv.label as pinned_variant_label
       from watches w
       left join listings l on l.id = w.listing_id
       left join products p on p.id = coalesce(l.product_id, w.product_id)
       left join listing_variants lv on lv.id = w.listing_variant_id
       where w.id = $1 and w.owner_id = $2`,
      [watchId, LOCAL_OWNER_ID]
    );
    const watch = watchRows[0];
    if (!watch) throw new Error("watch not found");
    params[0] = watchId;
    const pinned = watch.variant_selection === "specific" && watch.listing_variant_id;
    const result = pinned
      ? await pool.query(
          `select vpp.id, lv.listing_id, vpp.watch_id, vpp.price, vpp.currency, vpp.in_stock, vpp.scraped_at
           from variant_price_points vpp
           join listing_variants lv on lv.id = vpp.variant_id
           where vpp.watch_id = $1 ${sinceClause}
           order by vpp.scraped_at desc limit ${limitParam}`,
          params
        )
      : await pool.query(
          `select * from price_points where watch_id = $1 ${sinceClause} order by scraped_at desc limit ${limitParam}`,
          params
        );
    rows = result.rows;
    target = {
      watchId,
      listingId: watch.listing_id ?? null,
      displayTitle: watch.display_title ?? null,
      domain: watch.domain ?? null,
      title: watch.title ?? null,
      url: watch.url ?? null,
      product: watch.brand ? { brand: watch.brand, model: watch.model, modelYear: watch.model_year ?? null } : null,
      pinnedVariantLabel: pinned ? (watch.pinned_variant_label ?? null) : null,
    };
  } else {
    const { rows: listingRows } = await pool.query(
      `select l.*, p.brand, p.model, p.model_year
       from listings l left join products p on p.id = l.product_id
       where l.id = $1`,
      [listingId]
    );
    const listing = listingRows[0];
    if (!listing) throw new Error("listing not found");
    params[0] = listingId;
    const result = await pool.query(
      `select * from price_points where listing_id = $1 ${sinceClause} order by scraped_at desc limit ${limitParam}`,
      params
    );
    rows = result.rows;
    target = {
      watchId: null,
      listingId,
      domain: listing.domain,
      title: listing.title ?? null,
      url: listing.url,
      status: listing.status,
      product: listing.brand ? { brand: listing.brand, model: listing.model, modelYear: listing.model_year ?? null } : null,
      pinnedVariantLabel: null,
    };
  }

  const truncated = rows.length > limit;
  const points = rows
    .slice(0, limit)
    .map((row) => mapPricePoint(row))
    .reverse()
    .map((point) => ({ scrapedAt: point.scrapedAt, price: point.price, inStock: point.inStock }));

  const prices = points.map((point) => point.price).filter((price): price is number => price !== null);
  const first = points[0] ?? null;
  const latest = points.at(-1) ?? null;
  const changePct =
    first && latest && first.price && latest.price !== null
      ? Math.round(((latest.price - first.price) / first.price) * 1000) / 10
      : null;

  return {
    target,
    currency: (rows[0]?.currency as string | undefined) ?? null,
    since,
    points,
    summary: {
      count: points.length,
      first,
      latest,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      changePct,
      truncated,
    },
  };
}

async function listRetailersTool() {
  const { rows } = await pool.query(
    `select domain,
            count(*) as listing_count,
            sum(case when status = 'active' then 1 else 0 end) as active_count,
            sum(case when is_used = 1 then 1 else 0 end) as used_count,
            max(last_checked_at) as last_checked_at
     from listings
     group by domain
     order by listing_count desc, domain asc`
  );
  return rows.map((row) => {
    const source = findReferenceSourceByDomain(String(row.domain));
    return {
      domain: row.domain,
      name: source?.name ?? null,
      sourceId: source?.id ?? null,
      category: source?.category ?? null,
      listingCount: Number(row.listing_count),
      activeListingCount: Number(row.active_count),
      usedListingCount: Number(row.used_count),
      lastCheckedAt: toIso((row.last_checked_at as string | null) ?? null),
    };
  });
}

async function getListingTool(args: Record<string, unknown>) {
  const id = typeof args.id === "string" ? args.id : null;
  const url = typeof args.url === "string" ? args.url : null;
  if (!id && !url) {
    throw new Error("getListing requires id or url");
  }

  const { rows } = id
    ? await pool.query("select * from listings where id = $1", [id])
    : await pool.query("select * from listings where url = $1", [url]);

  const listing = rows[0];
  if (!listing) return null;

  let product = null;
  if (listing.product_id) {
    const { rows: productRows } = await pool.query("select * from products where id = $1", [listing.product_id]);
    product = productRows[0] ? mapProduct(productRows[0]) : null;
  }

  return { listing: mapListing(listing), product };
}

async function searchReferenceTool(args: Record<string, unknown>) {
  const category = String(args.category ?? "");
  const query = String(args.query ?? "");
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
  return searchReferenceCategory(category, query, limit);
}

async function fetchReferencePageTool(args: Record<string, unknown>) {
  const url = String(args.url ?? "").trim();
  if (!url) throw new Error("url is required");
  const section = typeof args.section === "string" ? args.section : undefined;
  return fetchCatalogReferencePage(url, { section });
}

interface ProductMatchSummary {
  id: string;
  brand: string;
  model: string;
  modelYear: number | null;
  category: string;
}

/**
 * Resolves one Product row from an id, brand/model pair, or free-text query.
 * Returns the best match plus up to four runners-up so the caller (and the
 * model) can see when the request was ambiguous and ask a Clarification.
 */
async function resolveProductRow(args: {
  productId?: string;
  brand?: string;
  model?: string;
  query?: string;
  label: string;
}): Promise<{ row: Record<string, unknown>; otherMatches: ProductMatchSummary[] }> {
  if (args.productId) {
    const { rows } = await pool.query("select * from products where id = $1", [args.productId]);
    const row = rows[0];
    if (!row) throw new Error(`${args.label}: product not found`);
    return { row, otherMatches: [] };
  }

  const brand = args.brand?.trim();
  const model = args.model?.trim();
  const query = args.query?.trim();
  if (!brand && !model && !query) {
    throw new Error(`${args.label}: provide productId, brand+model, or query`);
  }

  const { rows } = await pool.query(
    `select * from products
     where ($1 is null or lower(brand) like lower($1))
       and ($2 is null or lower(model) like lower($2))
       and ($3 is null or lower(brand) like lower($3) or lower(model) like lower($3) or lower(brand || ' ' || model) like lower($3))
     order by updated_at desc
     limit 5`,
    [brand ? `%${brand}%` : null, model ? `%${model}%` : null, query ? `%${query}%` : null]
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`${args.label}: product not found for ${[brand, model, query].filter(Boolean).join(" ")}`.trim());
  }
  return {
    row,
    otherMatches: rows.slice(1).map((other) => ({
      id: other.id as string,
      brand: other.brand as string,
      model: other.model as string,
      modelYear: (other.model_year as number | null) ?? null,
      category: other.category as string,
    })),
  };
}

async function resolveCompatibilityProduct(args: {
  productId?: string;
  brand?: string;
  model?: string;
  label: string;
}): Promise<CompatibilityProduct> {
  const { row } = await resolveProductRow(args);
  return {
    id: row.id as string,
    brand: row.brand as string,
    model: row.model as string,
    category: row.category as ProductCategory,
    specs: parseProductSpecs(row.specs),
  };
}

async function checkCompatibilityTool(args: Record<string, unknown>) {
  const productA = await resolveCompatibilityProduct({
    productId: typeof args.productAId === "string" ? args.productAId : undefined,
    brand: typeof args.productABrand === "string" ? args.productABrand : undefined,
    model: typeof args.productAModel === "string" ? args.productAModel : undefined,
    label: "productA",
  });
  const productB = await resolveCompatibilityProduct({
    productId: typeof args.productBId === "string" ? args.productBId : undefined,
    brand: typeof args.productBBrand === "string" ? args.productBBrand : undefined,
    model: typeof args.productBModel === "string" ? args.productBModel : undefined,
    label: "productB",
  });

  return checkCompatibility(productA, productB);
}

async function findCompatibleProductsTool(args: Record<string, unknown>) {
  const slotParsed = BuildSlotSchema.safeParse(args.slot);
  if (!slotParsed.success) throw new Error("slot is required");

  const forProduct = await resolveCompatibilityProduct({
    productId: typeof args.forProductId === "string" ? args.forProductId : undefined,
    brand: typeof args.forBrand === "string" ? args.forBrand : undefined,
    model: typeof args.forModel === "string" ? args.forModel : undefined,
    label: "forProduct",
  });

  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
  const targetCategory = BUILD_SLOT_TO_CATEGORY[slotParsed.data] as ProductCategory;

  const { rows } = await pool.query(
    `select * from products where category = $1 order by updated_at desc limit 100`,
    [targetCategory]
  );

  const candidates = rows.map((row) => ({
    id: row.id as string,
    brand: row.brand as string,
    model: row.model as string,
    category: row.category as ProductCategory,
    specs: parseProductSpecs(row.specs),
  }));

  return findCompatibleProducts(forProduct, candidates, { limit, slot: slotParsed.data });
}

async function enqueueResearchTool(args: Record<string, unknown>, context: ChatToolContext) {
  const question = String(args.question ?? "").trim();
  if (!question) throw new Error("question is required");

  const input: Record<string, unknown> = {
    question,
    sessionId: context.sessionId,
  };
  if (typeof args.targetProductId === "string") {
    input.targetProductId = args.targetProductId;
  }
  if (Array.isArray(args.categories)) {
    input.categories = args.categories.filter((value) => typeof value === "string");
  }

  const label = question.length > 80 ? `${question.slice(0, 77)}…` : question;
  const { task, jobs } = await createTaskWithLinearJobs(dbClient, {
    ownerId: LOCAL_OWNER_ID,
    kind: "ResearchQuestion",
    label,
    origin: "user",
    jobs: [{ kind: "ResearchQuestion", input }],
  });

  return {
    task: mapTask(task),
    jobId: jobs[0]?.id ?? null,
    message: "Research queued — check Tasks on your Profile for progress.",
  };
}

async function listSessionSummariesTool(args: Record<string, unknown>, context: ChatToolContext) {
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  const { rows } = await pool.query(
    `select id, title, summary_updated_at
     from chat_sessions
     where owner_id = $1
       and id != $2
       and summary is not null
     order by summary_updated_at desc
     limit $3`,
    [LOCAL_OWNER_ID, context.sessionId, limit]
  );
  return rows.map((row) => ({
    sessionId: row.id as string,
    title: row.title as string,
    summarizedAt: row.summary_updated_at as string,
  }));
}

async function getSessionSummaryTool(args: Record<string, unknown>, context: ChatToolContext) {
  const sessionId = typeof args.sessionId === "string" ? args.sessionId : context.sessionId;
  const { rows } = await pool.query(
    "select summary, summary_updated_at from chat_sessions where id = $1 and owner_id = $2",
    [sessionId, LOCAL_OWNER_ID]
  );
  const row = rows[0];
  if (!row) throw new Error("session not found");

  if (!row.summary) {
    return {
      sessionId,
      summary: null,
      summaryUpdatedAt: null,
      note: "No summary yet — background summarization runs once the Session has been quiet for several minutes.",
    };
  }

  return {
    sessionId,
    summary: row.summary as string,
    summaryUpdatedAt: row.summary_updated_at as string,
  };
}

async function getHandbookEntryTool(args: Record<string, unknown>) {
  const slug = typeof args.slug === "string" ? args.slug.trim() : "";
  const specKey = typeof args.specKey === "string" ? args.specKey.trim() : "";

  let resolvedSlug = slug;
  if (!resolvedSlug && specKey) {
    resolvedSlug = getHandbookEntryBySpecKey(specKey as keyof Spec)?.slug ?? "";
  }

  if (!resolvedSlug) {
    throw new Error("Handbook entry not found — provide slug or specKey");
  }

  const entry = loadHandbookEntryWithProse(resolvedSlug);
  if (!entry) {
    throw new Error("Handbook entry not found — provide slug or specKey");
  }

  return {
    slug: entry.slug,
    kind: entry.kind,
    label: entry.label,
    status: entry.status,
    specKey: entry.specKey ?? null,
    unit: entry.unit ?? null,
    appliesTo: entry.appliesTo ?? [],
    typicalRange: entry.typicalRange ?? null,
    summary: entry.summary,
    prose: entry.prose,
    illustrationPath: handbookIllustrationPublicPath(entry.illustration),
    baseBikePath: null,
    diagram: handbookDiagramId(entry.illustration),
    annotation: handbookAnnotationId(entry.illustration),
    sourceIds: entry.sourceIds ?? [],
  };
}

export { SPEC_FIELD_LABELS };
