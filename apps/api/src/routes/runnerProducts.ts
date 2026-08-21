import { Router } from "express";
import { z } from "zod";
import { SpecSchema } from "@framer/schema";
import { requireAgentToken } from "../lib/auth.js";
import { mergeProductSpecs } from "../services/productsService.js";

export const runnerProductsRouter = Router();

const MergeSpecsBodySchema = z.object({
  agentId: z.string().min(1),
  specs: SpecSchema,
});

runnerProductsRouter.post("/:id/specs", requireAgentToken, async (req, res) => {
  const productId = req.params.id;
  if (!productId) return res.status(400).json({ error: "product id required" });

  const parsed = MergeSpecsBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const merged = await mergeProductSpecs(productId, parsed.data.specs);
    res.json({ productId, specs: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : "merge failed";
    if (message.includes("not found")) return res.status(404).json({ error: message });
    return res.status(400).json({ error: message });
  }
});
