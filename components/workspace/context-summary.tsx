"use client";

import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function ContextSummary({
  title = "Contexto",
  onBack,
  onCollapse,
  wide,
  onToggleWide,
  children,
  footer,
  hidden,
  className,
}: {
  title?: string;
  onBack?: () => void;
  onCollapse?: () => void;
  wide?: boolean;
  onToggleWide?: () => void;
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        {onToggleWide ? (
          <span className="flex">
            <button
              type="button"
              className="hidden min-h-8 shrink-0 items-center gap-1 rounded-[6px] border border-border bg-secondary px-2.5 text-xs font-medium whitespace-nowrap text-[var(--brand)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] lg:inline-flex"
              aria-expanded={Boolean(wide)}
              aria-label={wide ? "Recolher contexto" : "Expandir contexto"}
              onClick={onToggleWide}
            >
              <ChevronLeft
                className={cn(
                  "size-4 shrink-0 transition-transform duration-[var(--motion-normal)]",
                  wide && "rotate-180",
                )}
                aria-hidden
              />
              {wide ? "Recolher" : "Expandir"}
            </button>
          </span>
        ) : onBack ? (
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
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div>
      <p className={cn("text-xs text-muted-foreground", className)}>{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
