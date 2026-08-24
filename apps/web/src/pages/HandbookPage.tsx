import { useEffect, useMemo, useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { PageHeader } from "../components/PageHeader.js";
import { HandbookEntryCard } from "../components/HandbookUi.js";
import { api, type HandbookCatalog, type HandbookEntryKind } from "../lib/api.js";

const KIND_FILTERS: Array<{ id: "all" | HandbookEntryKind; label: string }> = [
  { id: "all", label: "All" },
  { id: "measurement", label: "Measurements" },
  { id: "standard", label: "Standards" },
  { id: "concept", label: "Concepts" },
];

export function HandbookPage() {
  const [catalog, setCatalog] = useState<HandbookCatalog | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | HandbookEntryKind>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getHandbook()
      .then(setCatalog)
      .catch((err: Error) => setError(err.message));
  }, []);

  const filteredEntries = useMemo(() => {
    if (!catalog) return [];
    if (kindFilter === "all") return catalog.entries;
    return catalog.entries.filter((entry) => entry.kind === kindFilter);
  }, [catalog, kindFilter]);

  return (
    <div>
      <PageHeader
        title="Handbook"
        subtitle="MTB measurements, fitment standards, concepts, and the reference sources the app searches."
      />
      <div className="mx-auto max-w-5xl space-y-10 px-8 py-6">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {KIND_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setKindFilter(filter.id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  kindFilter === filter.id
                    ? "bg-brand-purple/15 text-brand-blue"
                    : "text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {!catalog ? (
            <p className="py-12 text-center text-sm text-neutral-500">Loading handbook…</p>
          ) : filteredEntries.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-500">No entries match this filter.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEntries.map((entry) => (
                <HandbookEntryCard
                  key={entry.slug}
                  slug={entry.slug}
                  label={entry.label}
                  summary={entry.summary}
                  kind={entry.kind}
                  status={entry.status}
                  illustrationPath={entry.illustrationPath}
                  baseBikePath={entry.baseBikePath}
                  diagram={entry.diagram}
                  annotation={entry.annotation}
                />
              ))}
            </div>
          )}
        </section>

        {catalog ? (
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-neutral-400" />
              <h2 className="text-lg font-medium text-neutral-100">Reference sources</h2>
            </div>
            <p className="text-sm text-neutral-500">{catalog.specSourceNote}</p>
            <div className="space-y-6">
              {catalog.sourceGroups.map((group) => (
                <div key={group.category} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
                  <h3 className="font-medium text-neutral-100">{group.label}</h3>
                  {group.role ? <p className="mt-1 text-sm text-neutral-500">{group.role}</p> : null}
                  <ul className="mt-4 space-y-2">
                    {group.sources.map((source) => (
                      <li key={source.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-brand-blue hover:underline"
                        >
                          {source.name}
                          <ExternalLink size={12} />
                        </a>
                        <span className="text-xs text-neutral-500">
                          {source.searchable ? "Assistant searchable" : source.isRetailer ? "Retailer" : "Browse only"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
