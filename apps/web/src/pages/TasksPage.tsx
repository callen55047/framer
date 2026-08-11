import { useCallback, useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { api, type Task } from "../lib/api.js";
import { PageHeader } from "../components/PageHeader.js";
import { EmptyState } from "../components/EmptyState.js";
import { TaskRow } from "../components/TaskRow.js";

/**
 * Defaults to user-initiated Tasks only — Sweep-originated refreshes roll
 * up into per-Watch health instead of flooding this list. See
 * CONTEXT.md#Sweep and CONTEXT.md#Task.
 */
export function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [showScheduled, setShowScheduled] = useState(false);

  const load = useCallback(async (includeAll: boolean) => {
    const { tasks } = await api.listTasks(includeAll);
    setTasks(tasks);
  }, []);

  useEffect(() => {
    load(showScheduled);
    const interval = setInterval(() => load(showScheduled), 4000);
    return () => clearInterval(interval);
  }, [load, showScheduled]);

  return (
    <div>
      <PageHeader title="Tasks" subtitle="Everything you've asked for: queued, active, succeeded, partial, and failed." />
      <div className="mx-auto max-w-3xl space-y-3 px-8 py-6">
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={showScheduled}
            onChange={(e) => setShowScheduled(e.target.checked)}
            className="rounded border-neutral-700 bg-neutral-950 accent-brand-purple"
          />
          Show scheduled background refreshes
        </label>

        {tasks === null ? (
          <p className="py-12 text-center text-sm text-neutral-500">Loading...</p>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No tasks yet"
            description="Add a Watch or hit refresh on one, and the Job it spawns shows up here through queued, active, and finished."
          />
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
