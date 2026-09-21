import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 border-b border-border/80 bg-transparent px-0 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
