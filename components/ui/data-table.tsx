import * as React from "react";
import { Frame, FramePanel } from "@/components/reui/frame";
import { cn } from "@/lib/utils";

export function DataTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Frame dense className={className}>
      <FramePanel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm [&_tbody_tr:hover]:bg-muted/40">{children}</table>
        </div>
      </FramePanel>
    </Frame>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "sticky top-0 border-b border-border bg-card px-4 py-3 font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("border-b border-border px-4 py-3.5 align-top", className)}>{children}</td>
  );
}
