import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { HandbookIllustration, HandbookKindBadge, HandbookStatusBadge } from "../components/HandbookUi.js";
import { api, type HandbookEntry } from "../lib/api.js";

function formatTypicalRange(entry: HandbookEntry): string | null {
  if (!entry.typicalRange) return null;
  const unit = entry.unit ? ` ${entry.unit}` : "";
  return `${entry.typicalRange.min}–${entry.typicalRange.max}${unit}`;
}

export function HandbookEntryPage() {
  const { slug = "" } = useParams();
  const [entry, setEntry] = useState<HandbookEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntry(null);
    setError(null);
    api
      .getHandbookEntry(slug)
      .then(({ entry: loaded }) => setEntry(loaded))
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  if (error) {
    return (
      <div className="px-8 py-12">
        <p className="text-sm text-red-400">{error}</p>
        <Link to="/handbook" className="mt-4 inline-block text-sm text-brand-blue hover:underline">
          Back to Handbook
        </Link>
      </div>
    );
  }

  if (!entry) {
    return <p className="px-8 py-12 text-center text-sm text-neutral-500">Loading entry…</p>;
  }

  const typicalRange = formatTypicalRange(entry);

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <Link to="/handbook" className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-200">
        <ArrowLeft size={16} />
        Handbook
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <HandbookKindBadge kind={entry.kind} />
        <HandbookStatusBadge status={entry.status} />
      </div>

      <h1 className="text-2xl font-semibold text-neutral-50">{entry.label}</h1>

      <div className="my-6 rounded-xl border border-neutral-800 bg-neutral-950/60 p-6">
        <HandbookIllustration
          illustrationPath={entry.illustrationPath}
          baseBikePath={entry.baseBikePath}
          diagram={entry.diagram}
          annotation={entry.annotation}
          interactive={entry.diagram !== null}
          alt={entry.label}
          className="h-48 w-full"
        />
      </div>

      <dl className="mb-8 grid gap-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-5 text-sm sm:grid-cols-2">
        {entry.unit ? (
          <div>
            <dt className="text-neutral-500">Unit</dt>
            <dd className="text-neutral-100">{entry.unit}</dd>
          </div>
        ) : null}
        {typicalRange ? (
          <div>
            <dt className="text-neutral-500">Typical range</dt>
            <dd className="text-neutral-100">{typicalRange}</dd>
          </div>
        ) : null}
        {entry.appliesTo && entry.appliesTo.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-neutral-500">Applies to</dt>
            <dd className="text-neutral-100">{entry.appliesTo.join(", ")}</dd>
          </div>
        ) : null}
        {entry.specKey ? (
          <div>
            <dt className="text-neutral-500">Spec key</dt>
            <dd className="font-mono text-xs text-neutral-300">{entry.specKey}</dd>
          </div>
        ) : null}
      </dl>

      <div className="prose prose-invert max-w-none prose-p:text-neutral-300 prose-strong:text-neutral-100">
        <Markdown>{entry.prose}</Markdown>
      </div>

      {entry.sources.length > 0 ? (
        <section className="mt-10 border-t border-neutral-800 pt-8">
          <h2 className="mb-3 text-lg font-medium text-neutral-100">Reference sources</h2>
          <ul className="space-y-2">
            {entry.sources.map((source) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand-blue hover:underline"
                >
                  {source.name}
                  <ExternalLink size={12} />
                </a>
                <span className="ml-2 text-xs text-neutral-500">{source.categoryLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
