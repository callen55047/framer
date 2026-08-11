import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-neutral-600">
        <Icon size={26} strokeWidth={1.5} />
      </div>
      <p className="text-base font-medium text-neutral-300">{title}</p>
      <p className="max-w-sm text-sm text-neutral-500">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
