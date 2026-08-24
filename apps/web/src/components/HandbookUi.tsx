import { Link } from "react-router-dom";
import { HandbookDiagram } from "./bike/HandbookDiagram.js";

interface HandbookIllustrationProps {
  illustrationPath: string | null;
  baseBikePath?: string | null;
  diagram?: string | null;
  annotation?: string | null;
  interactive?: boolean;
  alt: string;
  className?: string;
}

export function HandbookIllustration({
  illustrationPath,
  baseBikePath,
  diagram,
  annotation,
  interactive = false,
  alt,
  className = "h-32 w-full",
}: HandbookIllustrationProps) {
  if (diagram) {
    return (
      <HandbookDiagram
        diagramId={diagram}
        annotationId={annotation ?? undefined}
        interactive={interactive}
        alt={alt}
        className={className}
      />
    );
  }

  if (baseBikePath && illustrationPath) {
    return (
      <div className={`relative ${className}`}>
        <img src={baseBikePath} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain" />
        <img src={illustrationPath} alt={alt} className="absolute inset-0 h-full w-full object-contain" />
      </div>
    );
  }

  if (illustrationPath) {
    return <img src={illustrationPath} alt={alt} className={`object-contain ${className}`} />;
  }

  return null;
}

interface StatusBadgeProps {
  status: "compared" | "explained";
}

export function HandbookStatusBadge({ status }: StatusBadgeProps) {
  const styles =
    status === "compared"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : "bg-amber-500/10 text-amber-300 border-amber-500/20";
  const label = status === "compared" ? "Compared" : "Explained";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles}`}>{label}</span>;
}

interface KindBadgeProps {
  kind: "measurement" | "standard" | "concept";
}

export function HandbookKindBadge({ kind }: KindBadgeProps) {
  const labels = {
    measurement: "Measurement",
    standard: "Standard",
    concept: "Concept",
  };
  return <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{labels[kind]}</span>;
}

interface EntryCardProps {
  slug: string;
  label: string;
  summary: string;
  kind: "measurement" | "standard" | "concept";
  status: "compared" | "explained";
  illustrationPath: string | null;
  baseBikePath?: string | null;
  diagram?: string | null;
  annotation?: string | null;
}

export function HandbookEntryCard({
  slug,
  label,
  summary,
  kind,
  status,
  illustrationPath,
  baseBikePath,
  diagram,
  annotation,
}: EntryCardProps) {
  return (
    <Link
      to={`/handbook/${slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/60 transition-colors hover:border-neutral-700 hover:bg-neutral-900/60"
    >
      <div className="border-b border-neutral-800 bg-neutral-900/40 p-4">
        <HandbookIllustration
          illustrationPath={illustrationPath}
          baseBikePath={baseBikePath}
          diagram={diagram}
          annotation={annotation}
          alt={label}
          className="h-28 w-full"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <HandbookKindBadge kind={kind} />
          <HandbookStatusBadge status={status} />
        </div>
        <h3 className="font-medium text-neutral-100 group-hover:text-brand-blue">{label}</h3>
        <p className="line-clamp-2 text-sm text-neutral-500">{summary}</p>
      </div>
    </Link>
  );
}
