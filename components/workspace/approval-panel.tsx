"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ApprovalPanel({
  body,
  pending,
  error,
  onApprove,
  onReject,
  className,
}: {
  body?: string;
  pending?: boolean;
  error?: string | null;
  onApprove: () => void;
  onReject?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("border border-border bg-[var(--status-aguardando-bg)] px-3 py-2.5", className)}>
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Aguardando aprovação
      </p>
      {body ? <p className="mt-1 whitespace-pre-wrap text-sm">{body}</p> : null}
      {error ? <p className="mt-1 text-xs text-[var(--danger)]">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onApprove}>
          {pending ? "Enviando…" : "Aprovar e enviar"}
        </Button>
        {onReject ? (
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onReject}>
            Rejeitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
