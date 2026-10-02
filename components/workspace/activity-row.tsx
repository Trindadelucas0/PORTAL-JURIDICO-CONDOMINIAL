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
        <span className="flex min-w-0 flex-1 items-start gap-3">
          {when ? (
            <time className="mt-0.5 w-10 shrink-0 text-[11px] font-semibold text-muted-foreground tabular">{when}</time>
          ) : null}
          {icon ? (
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">{primary}</span>
            {secondary ? <span className="mt-0.5 block text-xs text-muted-foreground">{secondary}</span> : null}
          </span>
        </span>
        {trailing ? (
          <span className="hidden shrink-0 self-center text-xs font-medium text-primary sm:inline">{trailing}</span>
        ) : null}
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
