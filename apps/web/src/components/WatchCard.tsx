import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { api, type ListingVariant, type Watch } from "../lib/api.js";
import { buildVariantTable, type VariantTableColumn } from "../lib/variantTable.js";
import { TaskStatusBadge } from "./TaskStatusBadge.js";
import { PriceHistoryChart } from "./PriceHistoryChart.js";

const VARIANT_COLUMN_LABELS: Record<VariantTableColumn, string> = {
  frameSize: "Frame size",
  wheelSize: "Wheel size",
  options: "Options",
};

function watchHeading(watch: Watch): string {
  return watch.displayTitle ?? watch.listing?.title ?? watch.listing?.url ?? "Untitled listing";
}

function formatPriceRange(summary: Watch["variantSummary"]): string | null {
  if (!summary?.price || !summary.currency) return null;
  if (
    summary.variantSelection === "all" &&
    summary.lowestInStockPrice !== null &&
    summary.highestInStockPrice !== null &&
    summary.lowestInStockPrice !== summary.highestInStockPrice
  ) {
    return `$${summary.lowestInStockPrice.toFixed(2)} – $${summary.highestInStockPrice.toFixed(2)}`;
  }
  return `$${summary.price.toFixed(2)}`;
}

export function WatchCard({
  watch,
  onRefreshed,
  onRemoved,
}: {
  watch: Watch;
  onRefreshed: () => void;
  onRemoved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pricePoints, setPricePoints] = useState<Awaited<ReturnType<typeof api.listWatchPricePoints>>["pricePoints"] | null>(null);
  const [variants, setVariants] = useState<ListingVariant[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [pinningVariantId, setPinningVariantId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(watch.displayTitle ?? "");
  const [savingTitle, setSavingTitle] = useState(false);

  async function loadPricePoints() {
    setLoadingChart(true);
    try {
      const { pricePoints: points } = await api.listWatchPricePoints(watch.id);
      setPricePoints(points);
    } finally {
      setLoadingChart(false);
    }
  }

  async function loadVariants() {
    setLoadingVariants(true);
    try {
      const { variants: listingVariants } = await api.listWatchVariants(watch.id);
      setVariants(listingVariants);
    } finally {
      setLoadingVariants(false);
    }
  }

  useEffect(() => {
    void loadPricePoints();
  }, [watch.id]);

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && !variants) {
      await loadVariants();
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.refreshWatch(watch.id);
      onRefreshed();
      await loadPricePoints();
      if (expanded) await loadVariants();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRemove() {
    const title = watchHeading(watch);
    if (!window.confirm(`Stop watching "${title}"? Price history and past jobs are kept.`)) return;

    setRemoving(true);
    try {
      await api.deleteWatch(watch.id);
      onRemoved();
    } finally {
      setRemoving(false);
    }
  }

  async function handleSaveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed) return;
    setSavingTitle(true);
    try {
      await api.updateWatch(watch.id, trimmed);
      setEditingTitle(false);
      onRefreshed();
    } finally {
      setSavingTitle(false);
    }
  }

  async function handlePinVariant(variantId: string) {
    setPinningVariantId(variantId);
    try {
      await api.updateWatchVariant(watch.id, {
        variantSelection: "specific",
        listingVariantId: variantId,
      });
      onRefreshed();
      if (expanded) await loadVariants();
    } finally {
      setPinningVariantId(null);
    }
  }

  async function handleTrackAllVariants() {
    setPinningVariantId("all");
    try {
      await api.updateWatchVariant(watch.id, { variantSelection: "all" });
      onRefreshed();
      if (expanded) await loadVariants();
    } finally {
      setPinningVariantId(null);
    }
  }

  const listing = watch.listing;
  const summary = watch.variantSummary;
  const isProductTargeted = watch.targetType === "product";
  const isInactive = listing?.status === "inactive";
  const isUnsupported = listing?.status === "unsupported";
  const heading = watchHeading(watch);
  const scrapedTitle = listing?.title;
  const showScrapedSubtitle = scrapedTitle && scrapedTitle !== heading;
  const refreshDisabled = refreshing || isInactive || isUnsupported || removing;
  const headlinePrice = formatPriceRange(summary);
  const currency = summary?.currency ?? watch.latestPrice?.currency;
  const variantTable = useMemo(
    () => (variants ? buildVariantTable(variants) : { columns: [], rows: [] }),
    [variants]
  );

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 transition-colors hover:border-neutral-700">
      {isInactive && (
        <div className="border-b border-neutral-800 bg-neutral-950/60 px-4 py-2 text-xs text-neutral-400">
          Inactive — this listing was removed or is no longer available. Showing the last known price.
        </div>
      )}

      {isUnsupported && (
        <div className="border-b border-amber-900/50 bg-amber-950/30 px-4 py-2 text-xs text-amber-300">
          Not supported for watchlist — this doesn&apos;t appear to be mountain bike related.
          {watch.latestTask?.error && (
            <span className="mt-0.5 block text-amber-400/80">{watch.latestTask.error}</span>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {isInactive && (
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-400">
                Inactive
              </span>
            )}
            {isUnsupported && (
              <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                Unsupported
              </span>
            )}
            {isProductTargeted && (
              <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-medium text-brand-blue">
                Best price across sellers
              </span>
            )}
            {summary && (
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-300">
                {summary.variantSelection === "specific"
                  ? `Pinned: ${summary.pinnedLabel ?? "variant"}`
                  : "All variants"}
              </span>
            )}
            {watch.latestTask && <TaskStatusBadge status={watch.latestTask.status} />}
          </div>

          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={120}
                className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100 focus:border-brand-purple focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                disabled={savingTitle || !titleDraft.trim()}
                className="text-xs text-brand-purple hover:underline disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingTitle(false);
                  setTitleDraft(watch.displayTitle ?? "");
                }}
                className="text-xs text-neutral-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium text-neutral-100">{heading}</p>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(watch.displayTitle ?? heading);
                  setEditingTitle(true);
                }}
                title="Edit title"
                className="shrink-0 text-neutral-500 hover:text-neutral-300"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}

          {showScrapedSubtitle && (
            <p className="truncate text-xs text-neutral-600">{scrapedTitle}</p>
          )}
          {watch.frameSize && watch.wheelSizeInches && (
            <p className="text-xs text-neutral-500">
              Filtering {watch.frameSize} / {watch.wheelSizeInches}&quot;
            </p>
          )}
          {summary && summary.totalCount > 0 && (
            <p className="text-xs text-neutral-500">
              {summary.availableCount} of {summary.totalCount} variants in stock
            </p>
          )}
          <p className="truncate text-xs text-neutral-500">{listing?.domain ?? "—"}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            {headlinePrice ? (
              <>
                <p className="text-lg font-semibold text-neutral-50">
                  {headlinePrice}
                  <span className="ml-1 text-xs font-normal text-neutral-500">{currency}</span>
                </p>
                <p className="text-[11px] text-neutral-500">
                  {isInactive
                    ? "Last known price"
                    : summary?.inStock ?? watch.latestPrice?.inStock
                      ? "In stock"
                      : "Out of stock"}
                </p>
              </>
            ) : watch.latestPrice ? (
              <>
                <p className="text-lg font-semibold text-neutral-50">
                  ${watch.latestPrice.price.toFixed(2)}
                  <span className="ml-1 text-xs font-normal text-neutral-500">
                    {watch.latestPrice.currency}
                  </span>
                </p>
                <p className="text-[11px] text-neutral-500">
                  {watch.latestPrice.inStock ? "In stock" : "Out of stock"}
                </p>
              </>
            ) : (
              <p className="text-sm text-neutral-500">No price yet</p>
            )}
          </div>
          <button
            onClick={handleRemove}
            disabled={removing}
            title="Stop watching"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-red-400 disabled:opacity-30"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshDisabled}
            title={
              isInactive
                ? "Inactive listings are terminal and can't be refreshed"
                : isUnsupported
                  ? "Unsupported listings can't be refreshed"
                  : "Refresh now"
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
          <button
            onClick={toggleExpanded}
            aria-expanded={expanded}
            title="Show variant details"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      <div className="border-t border-neutral-800 px-4 py-3">
        {loadingChart ? (
          <p className="py-3 text-center text-xs text-neutral-500">Loading chart...</p>
        ) : (
          <PriceHistoryChart
            compact
            pricePoints={pricePoints ?? []}
            watchCreatedAt={watch.createdAt}
          />
        )}
      </div>

      {expanded && (
        <div className="border-t border-neutral-800 px-4 pb-4">
          {loadingVariants ? (
            <p className="py-6 text-center text-sm text-neutral-500">Loading details...</p>
          ) : (
            <>
              {variants && variants.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium text-neutral-400">Discovered variants</h3>
                    {watch.variantSelection === "specific" && (
                      <button
                        type="button"
                        onClick={handleTrackAllVariants}
                        disabled={pinningVariantId !== null}
                        className="text-xs text-brand-purple hover:underline disabled:opacity-50"
                      >
                        Track all variants
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-neutral-800">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-neutral-950/60 text-neutral-500">
                        <tr>
                          {variantTable.columns.map((column) => (
                            <th key={column} className="px-3 py-2 font-medium">
                              {VARIANT_COLUMN_LABELS[column]}
                            </th>
                          ))}
                          <th className="px-3 py-2 font-medium">Price</th>
                          <th className="px-3 py-2 font-medium">Stock</th>
                          <th className="px-3 py-2 font-medium">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {variantTable.rows.map((row) => {
                          const isPinned = watch.listingVariantId === row.variant.id;
                          const showStaleInColumn = row.isStale
                            ? variantTable.columns.includes("options")
                              ? "options"
                              : variantTable.columns[0] ?? null
                            : null;

                          return (
                            <tr
                              key={row.variant.id}
                              title={row.variant.label}
                              className="border-t border-neutral-800"
                            >
                              {variantTable.columns.map((column) => (
                                <td
                                  key={column}
                                  className={`px-3 py-2 ${
                                    column === "options" ? "text-neutral-200" : "text-neutral-300"
                                  }`}
                                >
                                  <span className="inline-flex flex-wrap items-center gap-2">
                                    {column === "frameSize"
                                      ? row.frameSize
                                      : column === "wheelSize"
                                        ? row.wheelSize
                                        : row.options}
                                    {showStaleInColumn === column && (
                                      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-400">
                                        Not seen
                                      </span>
                                    )}
                                  </span>
                                </td>
                              ))}
                              <td
                                className={`px-3 py-2 ${
                                  row.isCheapestInStock
                                    ? "font-medium text-brand-blue"
                                    : row.variant.inStock
                                      ? "text-neutral-300"
                                      : "text-neutral-500"
                                }`}
                              >
                                ${row.variant.price.toFixed(2)} {row.variant.currency}
                              </td>
                              <td
                                className={`px-3 py-2 ${
                                  row.variant.inStock ? "text-neutral-400" : "text-neutral-500"
                                }`}
                              >
                                {row.variant.inStock ? "In stock" : "Out of stock"}
                              </td>
                              <td className="px-3 py-2">
                                {isPinned ? (
                                  <span className="text-brand-purple">Tracking</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handlePinVariant(row.variant.id)}
                                    disabled={pinningVariantId !== null}
                                    className="text-brand-blue hover:underline disabled:opacity-50"
                                  >
                                    Track this variant
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
          <a
            href={listing?.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-brand-blue hover:underline"
          >
            View original listing ↗
          </a>
        </div>
      )}
    </div>
  );
}
