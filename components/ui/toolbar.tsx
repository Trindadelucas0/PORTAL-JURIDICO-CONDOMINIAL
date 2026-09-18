import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-card p-3 shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
