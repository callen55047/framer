import { Router } from "express";
import { z } from "zod";
import { requireAgentToken } from "../lib/auth.js";
import {
  loadSessionSummaryInput,
  persistSessionSummary,
} from "../services/chatSummarizeService.js";

export const runnerChatRouter = Router();

const PersistSummaryBodySchema = z.object({
  summary: z.string().min(1).max(4000),
  throughMessageId: z.string().nullable(),
});

runnerChatRouter.get("/sessions/:sessionId/summary-input", requireAgentToken, async (req, res) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) return res.status(400).json({ error: "session id required" });

  const loaded = await loadSessionSummaryInput(sessionId);
  if (!loaded) return res.status(404).json({ error: "session not found" });

  res.json({
    sessionId,
    existingSummary: loaded.existingSummary,
    messages: loaded.messages,
  });
});

runnerChatRouter.post("/sessions/:sessionId/summary", requireAgentToken, async (req, res) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) return res.status(400).json({ error: "session id required" });

  const parsed = PersistSummaryBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const loaded = await loadSessionSummaryInput(sessionId);
  if (!loaded) return res.status(404).json({ error: "session not found" });

  const summarizedAt = await persistSessionSummary(
    sessionId,
    parsed.data.summary,
    parsed.data.throughMessageId
  );
  res.json({
    summary: parsed.data.summary,
    messageCount: loaded.messages.length,
    summarizedAt,
  });
});
