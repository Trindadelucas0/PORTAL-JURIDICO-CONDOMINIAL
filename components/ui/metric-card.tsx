import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  href,
  label,
  value,
  hint,
  verb,
  icon: Icon,
  chip,
  chipClassName,
}: {
  href?: string;
  label: string;
  value: number;
  hint: string;
  verb?: string;
  icon?: LucideIcon;
  chip?: string;
  chipClassName?: string;
}) {
  const className =
    "group flex min-h-[132px] flex-col justify-between rounded-[var(--radius)] border border-border bg-card p-4 text-left shadow-[var(--shadow-sm)] transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)]";
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
        {Icon ? <Icon className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden /> : null}
      </span>
      <span className="my-2 block">
        <span className="block text-2xl leading-none font-bold tracking-tight text-foreground tabular">{value}</span>
        <span className="mt-1.5 block text-xs leading-snug text-muted-foreground">{hint}</span>
      </span>
      <span className="flex items-center justify-between gap-2 border-t border-border pt-2">
        {chip ? (
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", chipClassName)}>{chip}</span>
        ) : (
          <span />
        )}
        {verb && href ? <span className="text-xs font-medium text-primary">{verb} →</span> : null}
      </span>
    </>
  );
  if (!href) {
    return (
      <div className={className} aria-label={`${label}: ${value}`}>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} className={cn(className, "hover:border-primary/35 hover:bg-secondary/30 hover:shadow-[var(--shadow-md)] focus-visible:border-primary")}>
      {body}
    </Link>
  );
}
