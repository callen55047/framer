import { useCallback, useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { api, type Task } from "../lib/api.js";
import { EmptyState } from "./EmptyState.js";
import { TaskRow } from "./TaskRow.js";

/**
 * Defaults to user-initiated Tasks only — Sweep-originated refreshes roll
 * up into per-Watch health instead of flooding this list. See
 * CONTEXT.md#Sweep and CONTEXT.md#Task.
 */
export function TaskList() {
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
    <div className="space-y-3">
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
        <p className="py-8 text-center text-sm text-neutral-500">Loading...</p>
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
  );
}
