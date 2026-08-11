import { Router } from "express";
import { z } from "zod";
import { ExtractedVariantSchema } from "@framer/schema";
import { pool } from "../db/pool.js";
import { requireAgentToken } from "../lib/auth.js";
import { mapListing, mapListingVariant, mapPricePoint } from "../lib/mappers.js";
import { persistPricePoint } from "../services/listingsService.js";
import { listListingVariants, reconcileVariantSnapshot } from "../services/variantsService.js";

export const listingsRouter = Router();

listingsRouter.get("/:id/variants", async (req, res) => {
  const variants = await listListingVariants(req.params.id);
  res.json({ variants: variants.map((variant) => mapListingVariant({
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
  })) });
});

listingsRouter.get("/:id/price-points", async (req, res) => {
  const { rows } = await pool.query(
    "select * from price_points where listing_id = $1 order by scraped_at asc",
    [req.params.id]
  );
  res.json({ pricePoints: rows.map(mapPricePoint) });
});

const PersistBodySchema = z.object({
  agentId: z.string().min(1),
  productId: z.string().uuid().nullable(),
  price: z.number().nonnegative(),
  currency: z.string().length(3),
  inStock: z.boolean(),
  scrapedAt: z.string().datetime(),
  title: z.string(),
  watchId: z.string().uuid().optional(),
});

const VariantSnapshotBodySchema = z.object({
  agentId: z.string().min(1),
  productId: z.string().uuid().nullable(),
  title: z.string(),
  scrapedAt: z.string().datetime(),
  variants: z.array(ExtractedVariantSchema).min(1),
  watchIds: z.array(z.string().uuid()).optional(),
  discoveryFilter: z
    .object({
      frameSize: z.enum(["XS", "S", "M", "L", "XL", "XXL"]).optional(),
      wheelSizeInches: z.enum(["26", "27.5", "29"]).optional(),
    })
    .nullable()
    .optional(),
});

listingsRouter.post("/:id/variant-snapshot", requireAgentToken, async (req, res) => {
  const listingId = req.params.id;
  if (!listingId) return res.status(400).json({ error: "listing id required" });
  const parsed = VariantSnapshotBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await reconcileVariantSnapshot(listingId, {
      productId: parsed.data.productId,
      title: parsed.data.title,
      scrapedAt: parsed.data.scrapedAt,
      variants: parsed.data.variants,
      watchIds: parsed.data.watchIds,
      discoveryFilter: parsed.data.discoveryFilter ?? null,
    });
    const { rows } = await pool.query("select * from listings where id = $1", [listingId]);
    if (!rows[0]) return res.status(404).json({ error: "listing not found" });
    res.json({ listing: mapListing(rows[0]) });
  } catch (err) {
    if (err instanceof Error && err.message === "listing not found") {
      return res.status(404).json({ error: "listing not found" });
    }
    throw err;
  }
});

listingsRouter.post("/:id/price-points", requireAgentToken, async (req, res) => {
  const listingId = req.params.id;
  if (!listingId) return res.status(400).json({ error: "listing id required" });
  const parsed = PersistBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { productId, price, currency, inStock, scrapedAt, title, watchId } = parsed.data;

  try {
    const result = await persistPricePoint(listingId, {
      watchId: watchId ?? null,
      productId,
      price,
      currency,
      inStock,
      scrapedAt,
      title,
    });
    res.json({ pricePoint: mapPricePoint(result.pricePoint), listing: mapListing(result.listing) });
  } catch (err) {
    if (err instanceof Error && err.message === "listing not found") {
      return res.status(404).json({ error: "listing not found" });
    }
    throw err;
  }
});
