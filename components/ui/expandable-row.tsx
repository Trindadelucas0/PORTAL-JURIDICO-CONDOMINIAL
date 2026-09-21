"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExpandableRow({
  title,
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("border-b border-border", className)}>
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 py-2.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          {!open && summary ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)]",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}
