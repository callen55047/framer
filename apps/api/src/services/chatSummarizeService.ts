import { LOCAL_OWNER_ID, SummarizeChatSessionInputSchema, type JobRecord } from "@framer/schema";
import { getChatProvider } from "./chatService.js";
import { pool } from "../db/pool.js";
import { mapChatMessage } from "../lib/mappers.js";

export async function loadSessionSummaryInput(sessionId: string) {
  const { rows: sessionRows } = await pool.query(
    "select * from chat_sessions where id = $1 and owner_id = $2",
    [sessionId, LOCAL_OWNER_ID]
  );
  const session = sessionRows[0];
  if (!session) return null;

  const { rows: messageRows } = await pool.query(
    `select * from chat_messages
     where session_id = $1
       and (
         $2 is null
         or created_at > (select created_at from chat_messages where id = $2)
       )
     order by created_at asc`,
    [sessionId, session.summary_through_message_id ?? null]
  );

  return {
    session,
    existingSummary: (session.summary as string | null) ?? null,
    messages: messageRows.map(mapChatMessage),
  };
}

export async function persistSessionSummary(
  sessionId: string,
  summary: string,
  throughMessageId: string | null
) {
  const summarizedAt = new Date().toISOString();
  await pool.query(
    `update chat_sessions
     set summary = $2,
         summary_updated_at = $3,
         summary_through_message_id = $4,
         updated_at = datetime('now')
     where id = $1 and owner_id = $5`,
    [sessionId, summary, summarizedAt, throughMessageId, LOCAL_OWNER_ID]
  );
  return summarizedAt;
}

export async function runSummarizeChatSessionJob(job: JobRecord) {
  const input = SummarizeChatSessionInputSchema.parse(job.input);
  const loaded = await loadSessionSummaryInput(input.sessionId);
  if (!loaded) {
    throw new Error("session not found");
  }
  if (loaded.messages.length === 0) {
    return {
      summary: loaded.existingSummary ?? "",
      messageCount: 0,
      summarizedAt: new Date().toISOString(),
    };
  }

  const provider = getChatProvider();
  const summary = await provider.summarizeChatSession(
    loaded.messages.map((message) => ({
      role: message.role,
      content: message.content,
      toolName: message.toolName,
    })),
    loaded.existingSummary
  );

  const throughMessageId = loaded.messages.at(-1)?.id ?? null;
  const summarizedAt = await persistSessionSummary(input.sessionId, summary, throughMessageId);

  return {
    summary,
    messageCount: loaded.messages.length,
    summarizedAt,
  };
}
