import type { DbClient } from "../db/client.js";

/**
 * A Task's status rolls up from its child Jobs, including the `partial`
 * state that a flat Job-only model has no room for. See CONTEXT.md#Task.
 */
export async function rollupTaskStatus(client: DbClient, taskId: string): Promise<void> {
  const { rows } = await client.query<{ status: string }>("select status from jobs where task_id = $1", [
    taskId,
  ]);
  if (rows.length === 0) return;

  const statuses = rows.map((r) => r.status);
  const allSucceeded = statuses.every((s) => s === "succeeded");
  const anyInFlight = statuses.some((s) => s === "queued" || s === "leased");
  const anySucceeded = statuses.some((s) => s === "succeeded");
  const anyFailedOrCancelled = statuses.some((s) => s === "failed" || s === "cancelled");

  let status: string;
  if (allSucceeded) status = "succeeded";
  else if (anyInFlight) status = "active";
  else if (anySucceeded && anyFailedOrCancelled) status = "partial";
  else if (!anySucceeded && anyFailedOrCancelled) status = "failed";
  else status = "active";

  await client.query("update tasks set status = $1, updated_at = datetime('now') where id = $2", [
    status,
    taskId,
  ]);
}
