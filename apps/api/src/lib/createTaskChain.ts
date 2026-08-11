import type { JobKind } from "@framer/schema";
import type { DbClient } from "../db/client.js";
import { newId } from "../db/client.js";

export interface JobSpec {
  kind: JobKind;
  input: Record<string, unknown>;
}

/**
 * Create a Task and a linear chain of Jobs where each Job depends on the
 * previous one succeeding before it becomes claimable.
 */
export async function createTaskWithLinearJobs(
  client: DbClient,
  params: {
    ownerId: string;
    kind: JobKind;
    label: string;
    origin: "user" | "sweep";
    jobs: JobSpec[];
  }
): Promise<{ task: Record<string, unknown>; jobs: Record<string, unknown>[] }> {
  const taskId = newId();
  const { rows: taskRows } = await client.query(
    `insert into tasks (id, owner_id, kind, label, status, origin)
     values ($1, $2, $3, $4, 'queued', $5)
     returning *`,
    [taskId, params.ownerId, params.kind, params.label, params.origin]
  );
  const task = taskRows[0]!;

  const createdJobs: Record<string, unknown>[] = [];
  let previousJobId: string | null = null;

  for (const spec of params.jobs) {
    const jobId = newId();
    const { rows: jobRows } = await client.query(
      `insert into jobs (id, task_id, kind, status, input, depends_on_job_id)
       values ($1, $2, $3, 'queued', $4, $5)
       returning *`,
      [jobId, task.id, spec.kind, JSON.stringify(spec.input), previousJobId]
    );
    const job = jobRows[0]!;
    createdJobs.push(job);
    previousJobId = job.id as string;
  }

  return { task, jobs: createdJobs };
}
