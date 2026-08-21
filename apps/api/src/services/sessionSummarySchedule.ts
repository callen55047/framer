import { LOCAL_OWNER_ID } from "@framer/schema";
import { config } from "../config.js";
import { dbClient, newId, type DbClient } from "../db/pool.js";
import { unsummarizedMessagesExistsSql } from "../lib/chatSummaryStatus.js";

function idleModifier(): string {
  return `+${config.chatSummaryIdleMinutes} minutes`;
}

async function loadSessionForSchedule(
  client: DbClient,
  sessionId: string
): Promise<{ id: string; owner_id: string; title: string } | null> {
  const { rows } = await client.query<{ id: string; owner_id: string; title: string }>(
    "select id, owner_id, title from chat_sessions where id = $1 and owner_id = $2",
    [sessionId, LOCAL_OWNER_ID]
  );
  return rows[0] ?? null;
}

/**
 * Upsert a queued SummarizeChatSession Job, pushing not_before forward on each call.
 * When fromTimestamp is set, not_before is datetime(fromTimestamp, idle window) for boot reconcile.
 */
export async function scheduleSessionSummary(
  sessionId: string,
  client: DbClient = dbClient,
  options?: { fromTimestamp?: string }
): Promise<string | null> {
  const session = await loadSessionForSchedule(client, sessionId);
  if (!session) return null;

  const modifier = idleModifier();
  const notBeforeSql = options?.fromTimestamp
    ? `datetime($1, $2)`
    : `datetime('now', $1)`;
  const notBeforeParams = options?.fromTimestamp ? [options.fromTimestamp, modifier] : [modifier];
  const sessionParam = notBeforeParams.length + 1;

  const { rows: updated } = await client.query<{ id: string }>(
    `update jobs
     set not_before = ${notBeforeSql},
         updated_at = datetime('now')
     where kind = 'SummarizeChatSession'
       and status = 'queued'
       and json_extract(input, '$.sessionId') = $${sessionParam}
     returning id`,
    [...notBeforeParams, sessionId]
  );
  if (updated[0]) return updated[0].id;

  const taskId = newId();
  await client.query(
    `insert into tasks (id, owner_id, kind, label, status, origin)
     values ($1, $2, 'SummarizeChatSession', $3, 'queued', 'user')`,
    [taskId, session.owner_id, `Summarize chat: ${session.title}`]
  );

  const jobId = newId();
  const insertNotBeforeSql = options?.fromTimestamp
    ? `datetime($4, $5)`
    : `datetime('now', $4)`;
  await client.query(
    `insert into jobs (id, task_id, kind, status, input, not_before)
     values ($1, $2, 'SummarizeChatSession', 'queued', $3, ${insertNotBeforeSql})`,
    [jobId, taskId, JSON.stringify({ sessionId }), ...notBeforeParams]
  );
  return jobId;
}

/** Schedule summaries for Sessions that have unsummarized Messages and no pending Job. */
export async function reconcileSessionSummaries(client: DbClient = dbClient): Promise<number> {
  const { rows } = await client.query<{ id: string; updated_at: string }>(
    `select cs.id, cs.updated_at
     from chat_sessions cs
     where cs.owner_id = $1
       and ${unsummarizedMessagesExistsSql("cs")}
       and not exists (
         select 1 from jobs j
         where j.kind = 'SummarizeChatSession'
           and json_extract(j.input, '$.sessionId') = cs.id
           and j.status in ('queued', 'leased')
       )`,
    [LOCAL_OWNER_ID]
  );

  let scheduled = 0;
  for (const row of rows) {
    const jobId = await scheduleSessionSummary(row.id, client, { fromTimestamp: row.updated_at });
    if (jobId) scheduled += 1;
  }
  return scheduled;
}
