import { useCallback, useEffect, useState } from "react";
import { Eye, Plus } from "lucide-react";
import { api, type Watch } from "../lib/api.js";
import { PageHeader } from "../components/PageHeader.js";
import { EmptyState } from "../components/EmptyState.js";
import { WatchCard } from "../components/WatchCard.js";
import { AddWatchModal } from "../components/AddWatchModal.js";

export function WatchlistPage() {
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { watches } = await api.listWatches();
      setWatches(watches);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlist");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Watchlist"
        subtitle="Links you're tracking, and how their price has moved since you started watching."
        action={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={16} />
            Add watch
          </button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-6">
        {error && <p className="text-sm text-red-400">{error}</p>}

        {watches === null ? (
          <p className="py-12 text-center text-sm text-neutral-500">Loading...</p>
        ) : watches.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="Nothing watched yet"
            description="Add a retailer link to start tracking price from the first refresh."
            action={
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Add your first watch
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {watches.map((watch) => (
              <WatchCard key={watch.id} watch={watch} onRefreshed={load} onRemoved={load} />
            ))}
          </div>
        )}
      </div>

      <AddWatchModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={load} />
    </div>
  );
}
