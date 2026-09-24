import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE } from "@/lib/ui-labels";

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.arquivado;
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold", tone.pill)}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function PriorityIndicator({ priority }: { priority: string }) {
  const tone = PRIORITY_TONE[priority] ?? PRIORITY_TONE.media;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium", tone.pill)}>
      <span className={cn("size-1.5 rounded-full", tone.bar)} aria-hidden />
      {PRIORITY_LABEL[priority] || priority}
    </span>
  );
}
