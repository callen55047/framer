import { CheckCircle2, CircleDashed, RefreshCw } from "lucide-react";
import type { ChatSession } from "../lib/api.js";

const SUMMARY_STATUS_STYLES: Record<
  ChatSession["summaryStatus"],
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  none: { label: "No summary yet", className: "text-neutral-500", icon: CircleDashed },
  stale: { label: "Summary out of date", className: "text-amber-400", icon: RefreshCw },
  current: { label: "Summary up to date", className: "text-emerald-400", icon: CheckCircle2 },
};

function SummaryStatusIcon({ status }: { status: ChatSession["summaryStatus"] }) {
  const style = SUMMARY_STATUS_STYLES[status] ?? SUMMARY_STATUS_STYLES.none;
  const Icon = style.icon;
  return (
    <span title={style.label} aria-label={style.label} className={`mt-0.5 shrink-0 ${style.className}`}>
      <Icon size={13} />
    </span>
  );
}

export function ChatSessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const pct = Math.min(100, (session.tokenCount / session.contextBudgetTokens) * 100);
  const isFull = session.status === "full";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-brand-purple/40 bg-brand-purple/10"
          : "border-transparent hover:border-neutral-800 hover:bg-neutral-900/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-1.5">
          <SummaryStatusIcon status={session.summaryStatus} />
          <span className="line-clamp-2 text-sm font-medium text-neutral-200">{session.title}</span>
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="hidden rounded px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-800 hover:text-red-400 group-hover:inline"
        >
          Delete
        </button>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${isFull ? "bg-red-500" : "bg-brand-gradient"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
