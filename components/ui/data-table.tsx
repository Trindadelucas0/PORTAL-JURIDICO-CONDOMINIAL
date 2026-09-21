import * as React from "react";
import { cn } from "@/lib/utils";

export function DataTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-slot="data-table" className={cn("overflow-x-auto border-t border-border/80", className)}>
      <table className="w-full min-w-[720px] text-left text-sm [&_tbody_tr:hover]:bg-muted/30">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "sticky top-0 border-b border-border bg-background px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("border-b border-border/70 px-3 py-2.5 align-top", className)}>{children}</td>
  );
}
