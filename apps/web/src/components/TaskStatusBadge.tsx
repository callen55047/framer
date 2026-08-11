import { CheckCircle2, CircleDashed, Loader2, TriangleAlert, XCircle } from "lucide-react";

const STATUS_STYLES: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  queued: { label: "Queued", className: "text-neutral-400 bg-neutral-800/60", icon: CircleDashed },
  active: { label: "Active", className: "text-sky-400 bg-sky-500/10", icon: Loader2 },
  leased: { label: "Active", className: "text-sky-400 bg-sky-500/10", icon: Loader2 },
  succeeded: { label: "Succeeded", className: "text-emerald-400 bg-emerald-500/10", icon: CheckCircle2 },
  partial: { label: "Partial", className: "text-amber-400 bg-amber-500/10", icon: TriangleAlert },
  failed: { label: "Failed", className: "text-red-400 bg-red-500/10", icon: XCircle },
  cancelled: { label: "Cancelled", className: "text-neutral-500 bg-neutral-800/40", icon: XCircle },
};

export function TaskStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.queued!;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.className}`}>
      <Icon size={12} className={status === "active" || status === "leased" ? "animate-spin" : ""} />
      {style.label}
    </span>
  );
}
