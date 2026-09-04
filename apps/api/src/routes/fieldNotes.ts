import { Router } from "express";
import {
  CreateFieldNoteInputSchema,
  FieldNoteSearchInputSchema,
  LOCAL_OWNER_ID,
  UpdateFieldNoteInputSchema,
} from "@framer/schema";
import {
  confirmFieldNoteDraft,
  createFieldNote,
  deleteFieldNote,
  getFieldNote,
  listFieldNoteDrafts,
  listFieldNotes,
  listFieldNoteTags,
  searchFieldNotes,
  updateFieldNote,
} from "../services/fieldNoteService.js";

export const fieldNotesRouter = Router();

// /drafts and /tags must be registered before /:id, or Express will treat
// them as ids.
fieldNotesRouter.get("/drafts", async (_req, res) => {
  const drafts = await listFieldNoteDrafts(LOCAL_OWNER_ID);
  res.json({ drafts });
});

fieldNotesRouter.get("/tags", async (_req, res) => {
  const tags = await listFieldNoteTags(LOCAL_OWNER_ID);
  res.json({ tags });
});

fieldNotesRouter.get("/", async (req, res) => {
  const hasQuery = typeof req.query.query === "string" && req.query.query.length > 0;

  if (hasQuery) {
    const parsed = FieldNoteSearchInputSchema.safeParse({
      query: req.query.query,
      brand: req.query.brand,
      model: req.query.model,
      modelYear: req.query.modelYear ? Number(req.query.modelYear) : undefined,
      tag: req.query.tag,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const notes = await searchFieldNotes(LOCAL_OWNER_ID, parsed.data);
    return res.json({ notes });
  }

  const notes = await listFieldNotes(LOCAL_OWNER_ID, {
    brand: typeof req.query.brand === "string" ? req.query.brand : undefined,
    model: typeof req.query.model === "string" ? req.query.model : undefined,
    modelYear: req.query.modelYear ? Number(req.query.modelYear) : undefined,
    tag: typeof req.query.tag === "string" ? req.query.tag : undefined,
  });
  res.json({ notes });
});

fieldNotesRouter.get("/:id", async (req, res) => {
  const note = await getFieldNote(LOCAL_OWNER_ID, req.params.id);
  if (!note) return res.status(404).json({ error: "not found" });
  res.json({ note });
});

fieldNotesRouter.post("/", async (req, res) => {
  const parsed = CreateFieldNoteInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const note = await createFieldNote(LOCAL_OWNER_ID, parsed.data, { source: "user", status: "published" });
  res.status(201).json({ note });
});

fieldNotesRouter.patch("/:id", async (req, res) => {
  const parsed = UpdateFieldNoteInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const note = await updateFieldNote(LOCAL_OWNER_ID, req.params.id, parsed.data);
  if (!note) return res.status(404).json({ error: "not found" });
  res.json({ note });
});

fieldNotesRouter.post("/:id/confirm", async (req, res) => {
  const note = await confirmFieldNoteDraft(LOCAL_OWNER_ID, req.params.id);
  if (!note) return res.status(404).json({ error: "not found, or not a pending draft" });
  res.json({ note });
});

fieldNotesRouter.delete("/:id", async (req, res) => {
  const deleted = await deleteFieldNote(LOCAL_OWNER_ID, req.params.id);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});
