import { User } from "lucide-react";
import { PageHeader } from "../components/PageHeader.js";
import { EmptyState } from "../components/EmptyState.js";

/** Stub. No login in v1 — single seeded local owner (see CONTEXT.md and
 * LOCAL_OWNER_ID). This is the seam where real auth slots in later. */
export function ProfilePage() {
  return (
    <div>
      <PageHeader title="Profile" />
      <EmptyState
        icon={User}
        title="Local Rider"
        description="No login in v1 — everything belongs to a single seeded local owner. Real auth is additive here later, not a rewrite."
      />
    </div>
  );
}
