import {
  ASSISTANT_REFERENCE_CATEGORIES,
  LOCAL_OWNER_ID,
  ReferenceSourceCategorySchema,
  type ProductCategory,
} from "@framer/schema";
import type { ChatTool } from "@framer/runner/inference/types.js";
import { dbClient } from "../db/client.js";
import { pool } from "../db/pool.js";
import {
  checkCompatibility,
  parseProductSpecs,
  type CompatibilityProduct,
} from "./compatibilityRules.js";
import { mapListing, mapProduct, mapTask, mapWatch } from "./mappers.js";
import { lookupReferencePage } from "./referenceLookup.js";
import { computeWatchVariantSummary } from "../services/variantsService.js";

const REFERENCE_CATEGORY_ENUM = ReferenceSourceCategorySchema.options.filter((category) =>
  (ASSISTANT_REFERENCE_CATEGORIES as readonly string[]).includes(category)
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
    description: "Search products by brand or model substring.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Brand or model search text" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max products to return (default 10)" },
      },
      required: ["query"],
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
    name: "lookupReference",
    description:
      "Fetch MTB reference content from saved sites (manufacturer specs, compatibility databases, reviews). Returns page excerpt — cite the source in your answer.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: REFERENCE_CATEGORY_ENUM,
          description: "Reference source category to search",
        },
        query: { type: "string", description: "Search query (product name, compatibility topic, etc.)" },
      },
      required: ["category", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "checkCompatibility",
    description:
      "Evaluate Compatibility Rules between two Products using grounded Specs in the database. Returns deterministic pass/fail — not a model opinion.",
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
    case "lookupReference":
      return lookupReferenceTool(args);
    case "checkCompatibility":
      return checkCompatibilityTool(args);
    case "listSessionSummaries":
      return listSessionSummariesTool(args, context);
    case "getSessionSummary":
      return getSessionSummaryTool(args, context);
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
  if (!query) return [];
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const pattern = `%${query.toLowerCase()}%`;
  const { rows } = await pool.query(
    `select * from products
     where lower(brand) like $1 or lower(model) like $1
     order by updated_at desc
     limit $2`,
    [pattern, limit]
  );
  return rows.map((row) => ({
    ...mapProduct(row),
    specs: parseProductSpecs(row.specs),
  }));
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

async function lookupReferenceTool(args: Record<string, unknown>) {
  const category = String(args.category ?? "");
  const query = String(args.query ?? "");
  return lookupReferencePage(category, query);
}

async function resolveCompatibilityProduct(args: {
  productId?: string;
  brand?: string;
  model?: string;
  label: string;
}): Promise<CompatibilityProduct> {
  if (args.productId) {
    const { rows } = await pool.query("select * from products where id = $1", [args.productId]);
    const row = rows[0];
    if (!row) throw new Error(`${args.label}: product not found`);
    return {
      id: row.id as string,
      brand: row.brand as string,
      model: row.model as string,
      category: row.category as ProductCategory,
      specs: parseProductSpecs(row.specs),
    };
  }

  const brand = args.brand?.trim();
  const model = args.model?.trim();
  if (!brand || !model) {
    throw new Error(`${args.label}: provide productId or brand+model`);
  }

  const { rows } = await pool.query(
    `select * from products
     where lower(brand) = lower($1) and lower(model) = lower($2)
     order by updated_at desc
     limit 1`,
    [brand, model]
  );
  const row = rows[0];
  if (!row) throw new Error(`${args.label}: product not found for ${brand} ${model}`);
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
