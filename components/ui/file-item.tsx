import { formatBytes } from "@/lib/ui-labels";

export function FileItem({
  name,
  sizeBytes,
  meta,
  actions,
}: {
  name: string;
  sizeBytes?: number;
  meta?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="text-sm text-[var(--muted)]">
          {meta}
          {typeof sizeBytes === "number" ? ` · ${formatBytes(sizeBytes)}` : ""}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 gap-2 text-sm">{actions}</div> : null}
    </div>
  );
}
