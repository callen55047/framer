import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api, type Job, type Task } from "../lib/api.js";
import { TaskStatusBadge } from "./TaskStatusBadge.js";
import { StageTimeline } from "./StageTimeline.js";

export function TaskRow({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !jobs) {
      const { jobs: fetched } = await api.getTask(task.id);
      setJobs(fetched);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-4 p-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-100">{task.label}</p>
          <p className="text-xs text-neutral-500">
            {task.kind} · {new Date(task.createdAt).toLocaleString()}
            {task.origin === "sweep" && <span className="ml-1.5 text-neutral-600">· scheduled</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-neutral-500">
            {task.jobCounts.succeeded}/
            {task.jobCounts.succeeded +
              task.jobCounts.failed +
              task.jobCounts.cancelled +
              task.jobCounts.queued +
              task.jobCounts.leased}{" "}
            jobs done
          </span>
          <TaskStatusBadge status={task.status} />
          {expanded ? <ChevronUp size={15} className="text-neutral-500" /> : <ChevronDown size={15} className="text-neutral-500" />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-neutral-800 p-4">
          {jobs === null ? (
            <p className="text-sm text-neutral-500">Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-neutral-500">No jobs.</p>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-4 rounded-lg bg-neutral-950/50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-neutral-400">
                    {job.kind}
                    {job.dependsOnJobId && <span className="ml-1 text-neutral-600">· after predecessor</span>}
                  </p>
                  {job.stages.length > 0 && <StageTimeline stages={job.stages} />}
                </div>
                <div className="flex items-center gap-2">
                  {job.error && (
                    <span className="max-w-xs truncate text-[11px] text-red-400" title={job.error}>
                      {job.error}
                    </span>
                  )}
                  <TaskStatusBadge status={job.status === "leased" ? "active" : job.status} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
