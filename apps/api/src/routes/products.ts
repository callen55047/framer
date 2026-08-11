import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db/pool.js";
import { requireAgentToken } from "../lib/auth.js";
import { mapProduct } from "../lib/mappers.js";
import { resolveProduct } from "../lib/resolution.js";

export const productsRouter = Router();

const ResolveBodySchema = z.object({
  agentId: z.string().min(1),
  brand: z.string().min(1),
  modelGuess: z.string().min(1),
  modelYear: z.number().int().nullable().default(null),
  gtin: z.string().nullable().default(null),
  category: z.string().default("other"),
});

productsRouter.post("/resolve", requireAgentToken, async (req, res) => {
  const parsed = ResolveBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await withTransaction((client) => resolveProduct(client, parsed.data));
  res.json(result);
});

productsRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query("select * from products where id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json({ product: mapProduct(rows[0]) });
});
