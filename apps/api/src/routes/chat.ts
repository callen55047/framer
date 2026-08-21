import { Router } from "express";
import {
  CreateChatSessionInputSchema,
  LOCAL_OWNER_ID,
  SendChatMessageInputSchema,
  UpdateChatSessionInputSchema,
} from "@framer/schema";
import { pool } from "../db/pool.js";
import {
  createChatSession,
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  sendChatMessage,
  updateChatSessionTitle,
} from "../services/chatService.js";

export const chatRouter = Router();

function writeSse(res: import("express").Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

chatRouter.post("/sessions", async (req, res) => {
  const parsed = CreateChatSessionInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const session = await createChatSession(parsed.data.title);
  res.status(201).json({ session });
});

chatRouter.get("/sessions", async (_req, res) => {
  const sessions = await listChatSessions();
  res.json({ sessions });
});

chatRouter.patch("/sessions/:id", async (req, res) => {
  const parsed = UpdateChatSessionInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const session = await updateChatSessionTitle(req.params.id!, parsed.data.title);
  if (!session) return res.status(404).json({ error: "session not found" });
  res.json({ session });
});

chatRouter.delete("/sessions/:id", async (req, res) => {
  const deleted = await deleteChatSession(req.params.id!);
  if (!deleted) return res.status(404).json({ error: "session not found" });
  res.status(204).send();
});

chatRouter.get("/sessions/:id/messages", async (req, res) => {
  const messages = await listChatMessages(req.params.id!);
  if (!messages) return res.status(404).json({ error: "session not found" });
  res.json({ messages });
});

chatRouter.post("/sessions/:id/messages", async (req, res) => {
  const parsed = SendChatMessageInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows } = await pool.query(
    "select status from chat_sessions where id = $1 and owner_id = $2",
    [req.params.id, LOCAL_OWNER_ID]
  );
  if (!rows[0]) return res.status(404).json({ error: "session not found" });
  if (rows[0].status === "full") {
    return res.status(409).json({ error: "context_full" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  for await (const event of sendChatMessage(req.params.id!, parsed.data.content)) {
    writeSse(res, event.event, event.data);
  }
  res.end();
});
