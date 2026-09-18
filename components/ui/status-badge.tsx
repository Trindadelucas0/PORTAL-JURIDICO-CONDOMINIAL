import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE } from "@/lib/ui-labels";

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.arquivado;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tone.pill)}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function PriorityIndicator({ priority }: { priority: string }) {
  const tone = PRIORITY_TONE[priority] ?? PRIORITY_TONE.media;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide", tone.pill)}>
      {PRIORITY_LABEL[priority] || priority}
    </span>
  );
}
