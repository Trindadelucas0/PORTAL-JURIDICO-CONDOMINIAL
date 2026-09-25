"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  fitContent,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  fitContent?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className={className} fitContent={fitContent}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
