"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Painel modal centralizado para formulários e detalhes.
 * Mantém o nome `Drawer` por compatibilidade, mas não abre mais de lado:
 * no desktop é um diálogo centralizado; em telas pequenas ocupa a tela inteira.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** @deprecated sem efeito: o diálogo sempre se ajusta ao conteúdo. */
  fitContent?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = {
    sm: "sm:max-w-md",
    md: "sm:max-w-lg",
    lg: "sm:max-w-2xl",
    xl: "sm:max-w-4xl",
  }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-[2px]" />
        <DialogPrimitive.Popup
          data-slot="form-dialog"
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-popover text-sm text-popover-foreground outline-none transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[min(90dvh,860px)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:shadow-2xl sm:ring-1 sm:ring-foreground/10 sm:data-ending-style:scale-[0.97] sm:data-starting-style:scale-[0.97]",
            width,
            className,
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:pt-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              render={<Button variant="ghost" size="icon-sm" className="-mr-2 shrink-0" aria-label="Fechar" />}
            >
              <XIcon />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 [&_input:not([type=checkbox]):not([type=radio])]:w-full [&_select]:w-full">{children}</div>
          {footer ? (
            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-muted/40 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:rounded-b-xl sm:pb-3">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
