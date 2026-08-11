import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import type { Stage } from "../lib/api.js";

const ICONS: Record<Stage["status"], typeof CheckCircle2> = {
  pending: CircleDashed,
  running: Loader2,
  succeeded: CheckCircle2,
  failed: XCircle,
};

const COLORS: Record<Stage["status"], string> = {
  pending: "text-neutral-600",
  running: "text-sky-400",
  succeeded: "text-emerald-400",
  failed: "text-red-400",
};

const STAGE_ORDER: Stage["name"][] = ["fetch", "validate", "extract", "resolve", "persist"];

export function StageTimeline({ stages }: { stages: Stage[] }) {
  const byName = new Map(stages.map((s) => [s.name, s]));

  return (
    <div className="flex items-center gap-1">
      {STAGE_ORDER.map((name, i) => {
        const stage = byName.get(name);
        const status = stage?.status ?? "pending";
        const Icon = ICONS[status];
        return (
          <div key={name} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5" title={stage?.error ?? name}>
              <Icon size={13} className={`${COLORS[status]} ${status === "running" ? "animate-spin" : ""}`} />
              <span className="text-[11px] capitalize text-neutral-400">{name}</span>
              {stage && stage.attempt > 1 && (
                <span className="text-[10px] text-neutral-600">×{stage.attempt}</span>
              )}
            </div>
            {i < STAGE_ORDER.length - 1 && <div className="mx-1 h-px w-4 bg-neutral-800" />}
          </div>
        );
      })}
    </div>
  );
}
