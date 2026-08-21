import { ZodError } from "zod";
import {
  ClaimRequestSchema,
  CompleteRequestSchema,
  FailRequestSchema,
  HeartbeatRequestSchema,
  parseJobOutput,
  StageReportSchema,
  type JobKind,
} from "@framer/schema";
import { config } from "../config.js";
import { newId, pool, withTransaction, type DbClient } from "../db/pool.js";
import {
  claimNextJob,
  completeJob,
  extendLease,
  failJobTerminal,
  requireActiveLease,
} from "../lib/jobQueue.js";
import { mapArtifact, mapJob, mapStage } from "../lib/mappers.js";

const SWEEP_STALE_INTERVAL = "-24 hours";

export async function trySweep(client: DbClient): Promise<string | null> {
  if (!config.sweepEnabled) return null;

  const { rows } = await client.query<{ listing_id: string; url: string; owner_id: string; item_kind: string; expected_category: string | null }>(
    `select w.listing_id, l.url, w.owner_id, l.item_kind, l.expected_category
     from watches w
     join listings l on l.id = w.listing_id
     where w.target_type = 'listing'
       and l.status = 'active'
       and (l.last_checked_at is null or l.last_checked_at < datetime('now', $1))
       and not exists (
         select 1 from jobs j
         join tasks t on t.id = j.task_id
         where json_extract(j.input, '$.listingId') = w.listing_id
           and j.status in ('queued', 'leased')
       )
     order by l.last_checked_at asc
     limit 1`,
    [SWEEP_STALE_INTERVAL]
  );
  const row = rows[0];
  if (!row) return null;

  const taskId = newId();
  await client.query(
    `insert into tasks (id, owner_id, kind, label, status, origin)
     values ($1, $2, 'RefreshListing', $3, 'queued', 'sweep')`,
    [taskId, row.owner_id, `Scheduled refresh: ${row.url}`]
  );

  const jobId = newId();
  await client.query(
    `insert into jobs (id, task_id, kind, status, input)
     values ($1, $2, 'RefreshListing', 'queued', $3)`,
    [
      jobId,
      taskId,
      JSON.stringify({
        listingId: row.listing_id,
        url: row.url,
        itemKind: row.item_kind ?? "component",
        expectedCategory: row.expected_category ?? null,
        taskOrigin: "sweep",
      }),
    ]
  );
  return jobId;
}

export async function claimJob(
  agentId: string,
  kinds: JobKind[] | null,
  leaseSeconds: number
): Promise<{ job: Record<string, unknown>; leaseToken: string } | null> {
  return withTransaction(async (client) => {
    let claimed = await claimNextJob(client, agentId, kinds, leaseSeconds);
    if (!claimed) {
      await trySweep(client);
      claimed = await claimNextJob(client, agentId, kinds, leaseSeconds);
    }
    return claimed;
  });
}

export async function heartbeatJob(
  jobId: string,
  agentId: string,
  leaseToken: string,
  leaseSeconds: number
): Promise<boolean> {
  return withTransaction((client) =>
    extendLease(client, jobId, { agentId, leaseToken }, leaseSeconds)
  );
}

export async function reportJobStage(
  jobId: string,
  ctx: { agentId: string; leaseToken: string },
  input: {
    name: string;
    status: string;
    attempt: number;
    artifactId?: string | null;
    error?: string | null;
  }
): Promise<Record<string, unknown> | null> {
  const leased = await withTransaction((client) => requireActiveLease(client, jobId, ctx));
  if (!leased) return null;

  const stageId = newId();
  const { rows } = await pool.query(
    `insert into job_stages (id, job_id, name, status, attempt, artifact_id, error, started_at, finished_at)
     values ($1, $2, $3, $4, $5, $6, $7,
             case when $4 = 'running' then datetime('now') else null end,
             case when $4 in ('succeeded', 'failed') then datetime('now') else null end)
     on conflict (job_id, name) do update set
       status = excluded.status,
       attempt = excluded.attempt,
       artifact_id = coalesce(excluded.artifact_id, job_stages.artifact_id),
       error = excluded.error,
       started_at = coalesce(job_stages.started_at, excluded.started_at),
       finished_at = case when excluded.status in ('succeeded', 'failed') then datetime('now') else job_stages.finished_at end
     returning *`,
    [
      stageId,
      jobId,
      input.name,
      input.status,
      input.attempt,
      input.artifactId ?? null,
      input.error ?? null,
    ]
  );
  return rows[0] ?? null;
}

export async function recordJobArtifact(
  jobId: string,
  ctx: { agentId: string; leaseToken: string },
  input: { stage: string; contentType: string; path: string; byteSize: number }
): Promise<Record<string, unknown> | null> {
  const leased = await withTransaction((client) => requireActiveLease(client, jobId, ctx));
  if (!leased) return null;

  const artifactId = newId();
  const { rows } = await pool.query(
    `insert into artifacts (id, job_id, stage, content_type, path, byte_size)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [artifactId, jobId, input.stage, input.contentType, input.path, input.byteSize]
  );
  return rows[0] ?? null;
}

export async function completeJobForAgent(
  jobId: string,
  ctx: { agentId: string; leaseToken: string },
  output: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  return withTransaction(async (client) => {
    const leased = await requireActiveLease(client, jobId, ctx);
    if (!leased) return null;
    const validatedOutput = parseJobOutput(leased.kind as JobKind, output);
    return completeJob(client, jobId, ctx, validatedOutput);
  });
}

export async function failJobForAgent(
  jobId: string,
  ctx: { agentId: string; leaseToken: string },
  input: { stage?: string; error: string; terminal: boolean }
): Promise<Record<string, unknown> | null> {
  return withTransaction(async (client) => {
    if (!input.terminal) {
      return requireActiveLease(client, jobId, ctx);
    }
    const prefix = input.stage ? `[${input.stage}]` : "[job]";
    return failJobTerminal(client, jobId, ctx, `${prefix} ${input.error}`);
  });
}

export function parseClaimRequest(body: unknown) {
  return ClaimRequestSchema.safeParse(body);
}

export function parseHeartbeatRequest(body: unknown) {
  return HeartbeatRequestSchema.safeParse(body);
}

export function parseStageReport(body: unknown) {
  return StageReportSchema.safeParse(body);
}

export function parseCompleteRequest(body: unknown) {
  return CompleteRequestSchema.safeParse(body);
}

export function parseFailRequest(body: unknown) {
  return FailRequestSchema.safeParse(body);
}

export function isOutputValidationError(err: unknown): err is ZodError {
  return err instanceof ZodError;
}
