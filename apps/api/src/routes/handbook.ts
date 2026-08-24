import { Router } from "express";
import { getHandbookCatalog, getHandbookEntryBySlug } from "../services/handbookService.js";

export const handbookRouter = Router();

handbookRouter.get("/", (_req, res) => {
  res.json(getHandbookCatalog());
});

handbookRouter.get("/:slug", (req, res) => {
  const entry = getHandbookEntryBySlug(req.params.slug);
  if (!entry) return res.status(404).json({ error: "not found" });
  res.json({ entry });
});
