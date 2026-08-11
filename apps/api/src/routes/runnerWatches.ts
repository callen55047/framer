import { Router } from "express";
import { z } from "zod";
import { LOCAL_OWNER_ID } from "@framer/schema";
import { pool } from "../db/pool.js";
import { requireAgentToken } from "../lib/auth.js";
import { mapWatch } from "../lib/mappers.js";

export const runnerWatchesRouter = Router();

const DisplayTitleBodySchema = z.object({
  agentId: z.string().min(1),
  displayTitle: z.string().min(1).max(120),
});

runnerWatchesRouter.post("/:id/display-title", requireAgentToken, async (req, res) => {
  const watchId = req.params.id;
  if (!watchId) return res.status(400).json({ error: "watch id required" });
  const parsed = DisplayTitleBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows } = await pool.query(
    `update watches
     set display_title = $2, title_source = 'auto'
     where id = $1 and owner_id = $3 and title_source = 'auto' and display_title is null
     returning *`,
    [watchId, parsed.data.displayTitle, LOCAL_OWNER_ID]
  );
  if (!rows[0]) {
    const { rows: existing } = await pool.query("select * from watches where id = $1 and owner_id = $2", [
      watchId,
      LOCAL_OWNER_ID,
    ]);
    if (!existing[0]) return res.status(404).json({ error: "watch not found" });
    return res.json({ watch: mapWatch(existing[0]), skipped: true });
  }
  res.json({ watch: mapWatch(rows[0]), skipped: false });
});
