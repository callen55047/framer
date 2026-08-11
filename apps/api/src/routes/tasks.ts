import { Router } from "express";
import { LOCAL_OWNER_ID } from "@framer/schema";
import { pool, withTransaction } from "../db/pool.js";
import { inClause } from "../db/client.js";
import { createTaskWithLinearJobs } from "../lib/createTaskChain.js";
import { mapJob, mapStage, mapTask } from "../lib/mappers.js";

export const tasksRouter = Router();

tasksRouter.get("/", async (req, res) => {
  const includeAll = req.query.origin === "all";
  const { rows } = await pool.query(
    `select
       t.*,
       sum(case when j.status = 'queued' then 1 else 0 end) as queued_count,
       sum(case when j.status = 'leased' then 1 else 0 end) as leased_count,
       sum(case when j.status = 'succeeded' then 1 else 0 end) as succeeded_count,
       sum(case when j.status = 'failed' then 1 else 0 end) as failed_count,
       sum(case when j.status = 'cancelled' then 1 else 0 end) as cancelled_count
     from tasks t
     left join jobs j on j.task_id = t.id
     where t.owner_id = $1 ${includeAll ? "" : "and t.origin = 'user'"}
     group by t.id
     order by t.created_at desc
     limit 200`,
    [LOCAL_OWNER_ID]
  );

  res.json({
    tasks: rows.map((row) => ({
      ...mapTask(row),
      jobCounts: {
        queued: Number(row.queued_count),
        leased: Number(row.leased_count),
        succeeded: Number(row.succeeded_count),
        failed: Number(row.failed_count),
        cancelled: Number(row.cancelled_count),
      },
    })),
  });
});

tasksRouter.post("/acknowledge-proof", async (req, res) => {
  const stepsRaw = req.query.steps ?? req.body?.steps ?? 1;
  const steps = Math.min(Math.max(Number(stepsRaw) || 1, 1), 5);

  const result = await withTransaction((client) =>
    createTaskWithLinearJobs(client, {
      ownerId: LOCAL_OWNER_ID,
      kind: "Acknowledge",
      label: steps === 1 ? "Acknowledge pipeline proof" : `Acknowledge pipeline proof (${steps} steps)`,
      origin: "user",
      jobs: Array.from({ length: steps }, (_, i) => ({
        kind: "Acknowledge" as const,
        input: { step: i + 1, label: `Step ${i + 1}` },
      })),
    })
  );

  res.status(201).json({
    task: mapTask(result.task),
    jobs: result.jobs.map(mapJob),
  });
});

tasksRouter.get("/:id", async (req, res) => {
  const { rows: taskRows } = await pool.query("select * from tasks where id = $1 and owner_id = $2", [
    req.params.id,
    LOCAL_OWNER_ID,
  ]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ error: "not found" });

  const { rows: jobRows } = await pool.query("select * from jobs where task_id = $1 order by created_at asc", [
    req.params.id,
  ]);

  const jobIds = jobRows.map((j) => j.id);
  let stageRows: Record<string, unknown>[] = [];
  if (jobIds.length > 0) {
    const placeholders = inClause(jobIds);
    const { rows } = await pool.query(
      `select * from job_stages where job_id in (${placeholders.sql}) order by started_at asc`,
      placeholders.params
    );
    stageRows = rows;
  }

  const jobs = jobRows.map((job) => ({
    ...mapJob(job),
    stages: stageRows.filter((s) => s.job_id === job.id).map(mapStage),
  }));

  res.json({ task: mapTask(task), jobs });
});
