import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ActivityRow({
  href,
  primary,
  secondary,
  when,
  trailing,
  icon,
  variant = "row",
  className,
}: {
  href?: string;
  primary: string;
  secondary?: string;
  when?: string;
  trailing?: string;
  icon?: ReactNode;
  variant?: "row" | "log";
  className?: string;
}) {
  const inner =
    variant === "log" ? (
      <>
        <span className="flex min-w-0 flex-1 items-center gap-3">
          {when ? (
            <time className="shrink-0 rounded bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular">
              {when}
            </time>
          ) : null}
          {icon ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded border border-blue-200 bg-blue-50 text-blue-700">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-foreground">
            <span className="font-medium">{primary}</span>
            {secondary ? <span className="text-muted-foreground"> · {secondary}</span> : null}
          </span>
        </span>
        {trailing ? <span className="hidden shrink-0 text-xs font-medium text-primary sm:inline">{trailing}</span> : null}
      </>
    ) : (
      <>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">{primary}</span>
          {secondary ? <span className="text-muted-foreground"> · {secondary}</span> : null}
        </span>
        {when ? <time className="shrink-0 text-xs text-muted-foreground tabular">{when}</time> : null}
      </>
    );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 px-3 py-3 text-xs transition-colors duration-[var(--motion-fast)] hover:bg-slate-50",
          className,
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={cn("flex items-center gap-3 px-3 py-3 text-xs", className)}>{inner}</div>;
}
