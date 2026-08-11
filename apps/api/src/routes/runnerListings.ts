import { Router } from "express";
import { z } from "zod";
import { ListingRelevanceReasonSchema } from "@framer/schema";
import { pool } from "../db/pool.js";
import { requireAgentToken } from "../lib/auth.js";
import { mapListing } from "../lib/mappers.js";

import { markListingInactive, recordScheduledFailure } from "../services/listingsService.js";

export const runnerListingsRouter = Router();

const AgentBodySchema = z.object({
  agentId: z.string().min(1),
});

const UnsupportedBodySchema = AgentBodySchema.extend({
  reason: ListingRelevanceReasonSchema,
});

const ScheduledFailureBodySchema = AgentBodySchema.extend({
  httpStatus: z.number().int().optional(),
});

runnerListingsRouter.post("/:id/unsupported", requireAgentToken, async (req, res) => {
  const listingId = req.params.id;
  if (!listingId) return res.status(400).json({ error: "listing id required" });
  const parsed = UnsupportedBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows } = await pool.query(
    `update listings
     set status = 'unsupported', updated_at = datetime('now')
     where id = $1 and status != 'unsupported'
     returning *`,
    [listingId]
  );
  if (!rows[0]) {
    const { rows: existing } = await pool.query("select * from listings where id = $1", [listingId]);
    if (!existing[0]) return res.status(404).json({ error: "listing not found" });
    return res.json({ listing: mapListing(existing[0]), reason: parsed.data.reason });
  }
  res.json({ listing: mapListing(rows[0]), reason: parsed.data.reason });
});

runnerListingsRouter.post("/:id/inactive", requireAgentToken, async (req, res) => {
  const listingId = req.params.id;
  if (!listingId) return res.status(400).json({ error: "listing id required" });
  const parsed = ScheduledFailureBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.httpStatus === 404) {
    const listing = await markListingInactive(listingId);
    if (!listing) {
      const { rows: existing } = await pool.query("select * from listings where id = $1", [listingId]);
      if (!existing[0]) return res.status(404).json({ error: "listing not found" });
      return res.json({ listing: mapListing(existing[0]), becameInactive: existing[0].status === "inactive" });
    }
    return res.json({ listing: mapListing(listing), becameInactive: true });
  }

  const result = await recordScheduledFailure(listingId, { httpStatus: parsed.data.httpStatus });
  if (!result) {
    const { rows: existing } = await pool.query("select * from listings where id = $1", [listingId]);
    if (!existing[0]) return res.status(404).json({ error: "listing not found" });
    return res.json({ listing: mapListing(existing[0]), becameInactive: existing[0].status === "inactive" });
  }
  res.json({ listing: mapListing(result.listing), becameInactive: result.becameInactive });
});
