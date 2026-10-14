import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  meta,
  action,
  back,
  className,
  dense,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
  back?: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border/80",
        dense ? "mb-4 pb-3" : "mb-6 pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        {back ? <div className="mb-1.5">{back}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-0.5 text-sm text-muted-foreground">{meta}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
