import { computeVariantAggregate, findReferenceSourceByDomain } from "@framer/schema";
import { pool } from "../db/pool.js";
import { toIso, toNumber } from "../lib/mappers.js";

/**
 * A Product's Listings seen from the Product's side, each with its latest
 * observed price. Implements the CONTEXT.md rule that a Product's price is
 * derived at query time as its cheapest live Listing and is never stored.
 */
export interface ProductListingSummary {
  listingId: string;
  productId: string | null;
  url: string;
  domain: string;
  /** Reference-source display name when the domain is a registered retailer. */
  retailer: string | null;
  title: string | null;
  status: string;
  isUsed: boolean;
  price: number | null;
  currency: string | null;
  inStock: boolean;
  scrapedAt: string | null;
  priceSource: "variants" | "price_point" | null;
  variantSummary: {
    lowestInStockPrice: number | null;
    highestInStockPrice: number | null;
    availableCount: number;
    totalCount: number;
  } | null;
}

export interface DerivedProductPrice {
  price: number;
  currency: string;
  listingId: string;
  domain: string;
  retailer: string | null;
}

function placeholders(count: number, startAt = 1): string {
  return Array.from({ length: count }, (_, index) => `$${index + startAt}`).join(", ");
}

/** Cheapest in-stock, active, new-retail Listing across the given rows, or null. */
export function deriveProductPrice(listings: ProductListingSummary[]): DerivedProductPrice | null {
  let best: DerivedProductPrice | null = null;
  for (const listing of listings) {
    if (listing.status !== "active" || !listing.inStock || listing.isUsed) continue;
    if (listing.price === null || listing.currency === null) continue;
    if (!best || listing.price < best.price) {
      best = {
        price: listing.price,
        currency: listing.currency,
        listingId: listing.listingId,
        domain: listing.domain,
        retailer: listing.retailer,
      };
    }
  }
  return best;
}

/** In-stock active Listings first, then by ascending price; unpriced rows last. */
export function sortListingsCheapestFirst(listings: ProductListingSummary[]): ProductListingSummary[] {
  return [...listings].sort((a, b) => {
    const aLive = a.status === "active" && a.inStock ? 0 : 1;
    const bLive = b.status === "active" && b.inStock ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    if (a.price === null && b.price === null) return 0;
    if (a.price === null) return 1;
    if (b.price === null) return -1;
    return a.price - b.price;
  });
}

/**
 * Loads every Listing for the given Products with its latest price point and,
 * where the Listing has variants, the variant aggregate (which wins because it
 * reflects per-SKU stock). Returns a map keyed by product id; Products with no
 * Listings are absent from the map.
 */
export async function listProductListings(
  productIds: string[]
): Promise<Map<string, ProductListingSummary[]>> {
  const result = new Map<string, ProductListingSummary[]>();
  const ids = [...new Set(productIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return result;

  const { rows: listingRows } = await pool.query(
    `select
       l.id, l.product_id, l.url, l.domain, l.title, l.status, l.is_used,
       pp.price as latest_price, pp.currency as latest_currency,
       pp.in_stock as latest_in_stock, pp.scraped_at as latest_scraped_at
     from listings l
     left join price_points pp on pp.id = (
       select id from price_points where listing_id = l.id order by scraped_at desc limit 1
     )
     where l.product_id in (${placeholders(ids.length)})
     order by l.created_at asc`,
    ids
  );
  if (listingRows.length === 0) return result;

  const listingIds = listingRows.map((row) => row.id as string);
  const { rows: variantRows } = await pool.query(
    `select listing_id, price, currency, in_stock
     from listing_variants
     where listing_id in (${placeholders(listingIds.length)})`,
    listingIds
  );
  const variantsByListing = new Map<string, Array<{ price: number; currency: string; inStock: boolean }>>();
  for (const row of variantRows) {
    const listingId = row.listing_id as string;
    const bucket = variantsByListing.get(listingId) ?? [];
    bucket.push({
      price: Number(row.price),
      currency: String(row.currency),
      inStock: row.in_stock === 1 || row.in_stock === true,
    });
    variantsByListing.set(listingId, bucket);
  }

  for (const row of listingRows) {
    const listingId = row.id as string;
    const productId = (row.product_id as string | null) ?? null;
    const domain = String(row.domain);
    const variants = variantsByListing.get(listingId) ?? [];

    let price = toNumber((row.latest_price as number | null) ?? null);
    let currency = (row.latest_currency as string | null) ?? null;
    let inStock = row.latest_in_stock === 1 || row.latest_in_stock === true;
    let priceSource: ProductListingSummary["priceSource"] = price !== null ? "price_point" : null;
    let variantSummary: ProductListingSummary["variantSummary"] = null;

    if (variants.length > 0) {
      const aggregate = computeVariantAggregate(variants);
      variantSummary = {
        lowestInStockPrice: aggregate.lowestInStockPrice,
        highestInStockPrice: aggregate.highestInStockPrice,
        availableCount: aggregate.availableCount,
        totalCount: aggregate.totalCount,
      };
      price = aggregate.price;
      currency = aggregate.currency ?? currency;
      inStock = aggregate.inStock;
      priceSource = "variants";
    }

    const summary: ProductListingSummary = {
      listingId,
      productId,
      url: String(row.url),
      domain,
      retailer: findReferenceSourceByDomain(domain)?.name ?? null,
      title: (row.title as string | null) ?? null,
      status: String(row.status),
      isUsed: row.is_used === 1 || row.is_used === true,
      price,
      currency,
      inStock,
      scrapedAt: toIso((row.latest_scraped_at as string | null) ?? null),
      priceSource,
      variantSummary,
    };

    if (!productId) continue;
    const bucket = result.get(productId) ?? [];
    bucket.push(summary);
    result.set(productId, bucket);
  }

  for (const [productId, listings] of result) {
    result.set(productId, sortListingsCheapestFirst(listings));
  }
  return result;
}
