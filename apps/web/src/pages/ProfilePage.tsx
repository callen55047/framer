import { User } from "lucide-react";
import { PageHeader } from "../components/PageHeader.js";
import { TaskList } from "../components/TaskList.js";

/** Stub. No login in v1 — single seeded local owner (see CONTEXT.md and
 * LOCAL_OWNER_ID). This is the seam where real auth slots in later. */
export function ProfilePage() {
  return (
    <div>
      <PageHeader title="Profile" subtitle="Local rider account and background work." />
      <div className="mx-auto max-w-3xl space-y-10 px-8 py-6">
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-neutral-300">
              <User size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-lg font-medium text-neutral-100">Local Rider</h2>
              <p className="text-sm text-neutral-500">
                No login in v1 — everything belongs to a single seeded local owner. Real auth is additive here later.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-lg font-medium text-neutral-100">Tasks</h2>
          <p className="mb-4 text-sm text-neutral-500">
            Everything you&apos;ve asked for: queued, active, succeeded, partial, and failed.
          </p>
          <TaskList />
        </section>
      </div>
    </div>
  );
}
