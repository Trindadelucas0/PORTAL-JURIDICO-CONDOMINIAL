import Link from "next/link";
import { cn } from "@/lib/utils";

export function ActivityRow({
  href,
  primary,
  secondary,
  when,
  trailing,
  variant = "row",
  className,
}: {
  href?: string;
  primary: string;
  secondary?: string;
  when?: string;
  trailing?: string;
  variant?: "row" | "log";
  className?: string;
}) {
  const inner =
    variant === "log" ? (
      <>
        {when ? <time className="w-12 shrink-0 tabular text-xs text-muted-foreground">{when}</time> : null}
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">{primary}</span>
          {secondary ? <span className="text-muted-foreground"> · {secondary}</span> : null}
        </span>
        {trailing ? <span className="shrink-0 text-xs text-[var(--brand)]">{trailing}</span> : null}
      </>
    ) : (
      <>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">{primary}</span>
          {secondary ? <span className="text-muted-foreground"> · {secondary}</span> : null}
        </span>
        {when ? <time className="shrink-0 tabular text-xs text-muted-foreground">{when}</time> : null}
      </>
    );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "flex items-baseline gap-3 border-b border-border/60 py-2 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-muted/40",
          className,
        )}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={cn("flex items-baseline gap-3 border-b border-border/60 py-2 text-sm", className)}>{inner}</div>
  );
}
