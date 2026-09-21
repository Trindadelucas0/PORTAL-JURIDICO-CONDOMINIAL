"use client";

import { cn } from "@/lib/utils";

export function ContextSummary({
  title = "Contexto",
  onBack,
  onCollapse,
  children,
  footer,
  hidden,
  className,
}: {
  title?: string;
  onBack?: () => void;
  onCollapse?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  hidden?: boolean;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        hidden && "hidden xl:flex",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        {onBack ? (
          <button type="button" className="text-sm text-[var(--brand)] xl:hidden" onClick={onBack}>
            ← Conversa
          </button>
        ) : (
          <span />
        )}
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h2>
        {onCollapse ? (
          <button
            type="button"
            className="hidden text-xs text-muted-foreground xl:inline"
            onClick={onCollapse}
            aria-label="Recolher contexto"
          >
            Recolher
          </button>
        ) : (
          <span className="w-8" />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">{children}</div>
      {footer ? <div className="shrink-0 border-t border-border p-3">{footer}</div> : null}
    </aside>
  );
}

export function ContextBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
