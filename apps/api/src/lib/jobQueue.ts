import { randomUUID } from "node:crypto";
import type { JobKind } from "@framer/schema";
import type { DbClient } from "../db/client.js";
import { inClause } from "../db/client.js";
import { rollupTaskStatus } from "./taskRollup.js";

export interface LeaseContext {
  agentId: string;
  leaseToken: string;
}

/** Verify the caller holds a live lease on this job. */
export async function requireActiveLease(
  client: DbClient,
  jobId: string,
  ctx: LeaseContext
): Promise<Record<string, unknown> | null> {
  const { rows } = await client.query(
    `select * from jobs
     where id = $1
       and status = 'leased'
       and leased_by = $2
       and lease_token = $3
       and lease_expires_at > datetime('now')`,
    [jobId, ctx.agentId, ctx.leaseToken]
  );
  return rows[0] ?? null;
}

const CLAIMABLE_WHERE = `
  (
    (j.status = 'queued'
      and (j.depends_on_job_id is null
        or exists (
          select 1 from jobs pred
          where pred.id = j.depends_on_job_id and pred.status = 'succeeded'
        )))
    or (j.status = 'leased' and j.lease_expires_at < datetime('now'))
  )
`;

/** Claim the next eligible job and return it with a fresh lease token. */
export async function claimNextJob(
  client: DbClient,
  agentId: string,
  kinds: JobKind[] | null,
  leaseSeconds: number
): Promise<{ job: Record<string, unknown>; leaseToken: string } | null> {
  const kindFilter = kinds && kinds.length > 0;
  const kindParams = kindFilter ? inClause(kinds) : null;
  const { rows } = await client.query(
    `select j.id from jobs j
     where ${CLAIMABLE_WHERE}
       ${kindFilter ? `and j.kind in (${kindParams!.sql})` : ""}
     order by j.created_at asc
     limit 1`,
    kindFilter ? kindParams!.params : []
  );

  const jobId = rows[0]?.id as string | undefined;
  if (!jobId) return null;

  const leaseToken = randomUUID();
  const leaseModifier = `+${leaseSeconds} seconds`;
  const { rows: leased } = await client.query(
    `update jobs
     set status = 'leased',
         leased_by = $2,
         lease_token = $3,
         lease_expires_at = datetime('now', $4),
         attempt = attempt + 1,
         updated_at = datetime('now')
     where id = $1
     returning *`,
    [jobId, agentId, leaseToken, leaseModifier]
  );
  const job = leased[0];
  if (!job) return null;

  await client.query(
    `update tasks set status = 'active', updated_at = datetime('now')
     where id = $1 and status = 'queued'`,
    [job.task_id]
  );

  return { job, leaseToken };
}

/** Mark queued dependents cancelled when a prerequisite job fails. */
export async function cancelDependentJobs(client: DbClient, failedJobId: string): Promise<void> {
  await client.query(
    `with recursive deps as (
       select id from jobs where depends_on_job_id = $1 and status = 'queued'
       union all
       select j.id from jobs j
       join deps d on j.depends_on_job_id = d.id
       where j.status = 'queued'
     )
     update jobs set status = 'cancelled', updated_at = datetime('now')
     where id in (select id from deps)`,
    [failedJobId]
  );
}

export async function completeJob(
  client: DbClient,
  jobId: string,
  ctx: LeaseContext,
  output: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const leased = await requireActiveLease(client, jobId, ctx);
  if (!leased) return null;

  const { rows } = await client.query(
    `update jobs
     set status = 'succeeded', output = $2, updated_at = datetime('now'),
         lease_token = null, leased_by = null, lease_expires_at = null
     where id = $1
     returning *`,
    [jobId, JSON.stringify(output)]
  );
  const job = rows[0];
  if (!job) return null;
  await rollupTaskStatus(client, job.task_id as string);
  return job;
}

export async function failJobTerminal(
  client: DbClient,
  jobId: string,
  ctx: LeaseContext,
  errorMessage: string
): Promise<Record<string, unknown> | null> {
  const leased = await requireActiveLease(client, jobId, ctx);
  if (!leased) return null;

  const { rows } = await client.query(
    `update jobs
     set status = 'failed', error = $2, updated_at = datetime('now'),
         lease_token = null, leased_by = null, lease_expires_at = null
     where id = $1
     returning *`,
    [jobId, errorMessage]
  );
  const job = rows[0];
  if (!job) return null;
  await cancelDependentJobs(client, jobId);
  await rollupTaskStatus(client, job.task_id as string);
  return job;
}

export async function extendLease(
  client: DbClient,
  jobId: string,
  ctx: LeaseContext,
  leaseSeconds: number
): Promise<boolean> {
  const leaseModifier = `+${leaseSeconds} seconds`;
  const { rows } = await client.query(
    `update jobs
     set lease_expires_at = datetime('now', $2), updated_at = datetime('now')
     where id = $1
       and status = 'leased'
       and leased_by = $3
       and lease_token = $4
       and lease_expires_at > datetime('now')
     returning id`,
    [jobId, leaseModifier, ctx.agentId, ctx.leaseToken]
  );
  return rows.length > 0;
}
