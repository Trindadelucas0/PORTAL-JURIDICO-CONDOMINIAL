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
    "group flex min-h-[148px] flex-col justify-between rounded-[var(--radius)] border border-border bg-card p-4 text-left transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)]";
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {Icon ? <Icon className="size-[18px] text-muted-foreground group-hover:text-primary" aria-hidden /> : null}
      </span>
      <span className="my-2.5 block">
        <span className="block text-[28px] leading-none font-bold tracking-tight text-foreground tabular">{value}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
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
      <div className={cn(className, "hover:border-border")} aria-label={`${label}: ${value}`}>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
