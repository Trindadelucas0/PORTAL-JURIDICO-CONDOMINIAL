import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/ui-labels";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "resolvido" || status === "open"
      ? "text-[var(--ok)]"
      : status === "aguardando" || status === "connecting"
        ? "text-[var(--warn)]"
        : status === "arquivado"
          ? "text-[var(--muted)]"
          : "text-[var(--ink)]";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function PriorityIndicator({ priority }: { priority: string }) {
  const label = priority === "media" ? "Normal" : priority;
  const cls =
    priority === "urgente" || priority === "alta"
      ? "text-[var(--danger)]"
      : priority === "baixa"
        ? "text-[var(--muted)]"
        : "text-[var(--ink)]";
  return <span className={cn("text-xs font-semibold uppercase tracking-wide", cls)}>{label}</span>;
}
