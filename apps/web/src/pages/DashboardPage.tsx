import { Newspaper } from "lucide-react";
import { PageHeader } from "../components/PageHeader.js";
import { EmptyState } from "../components/EmptyState.js";

/**
 * App-shell stub only, deliberately. The dashboard is pure derivative — it
 * needs price history (from the Watchlist pipeline) and follow/RSS data
 * that don't exist yet — so it's the last thing built even though it's the
 * first thing seen. See the plan's "After the slice" ordering.
 */
export function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Price movements and brand news, once there's data to show." />
      <EmptyState
        icon={Newspaper}
        title="Nothing to show yet"
        description="Add a few Watches to start building price history, and this becomes your daily read on what's moved."
      />
    </div>
  );
}
