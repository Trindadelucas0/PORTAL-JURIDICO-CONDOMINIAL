"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { TooltipRenderProps } from "react-joyride";

export function TourTooltip({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  size,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  const progress = ((index + 1) / size) * 100;

  return (
    <section
      {...tooltipProps}
      aria-label={`Orientação ${index + 1} de ${size}: ${typeof step.title === "string" ? step.title : "Juricon"}`}
      className="w-[calc(100vw-1.5rem)] max-w-[25rem] overflow-hidden rounded-xl border border-border-strong bg-popover text-popover-foreground shadow-[0_18px_48px_-16px_rgba(15,23,42,0.4)]"
    >
      <div className="h-1 bg-muted" aria-hidden>
        <div
          className="h-full rounded-r-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
        <p className="pr-10 text-[0.7rem] font-semibold tracking-[0.12em] text-primary uppercase">
          Passo {index + 1} de {size}
        </p>
        <button
          {...closeProps}
          type="button"
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:size-9"
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Fechar apresentação</span>
        </button>

        {step.title ? (
          <h2 className="mt-2 pr-6 text-left text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
            {step.title}
          </h2>
        ) : null}
        <div className="mt-3 text-left text-[0.95rem] leading-6 text-muted-foreground sm:text-sm sm:leading-6">
          {step.content}
        </div>
      </div>

      <footer className="border-t border-border bg-muted/45 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <button
            {...skipProps}
            type="button"
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-9"
          >
            Pular
          </button>

          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button
                {...backProps}
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-9"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Voltar
              </button>
            ) : null}
            <button
              {...primaryProps}
              type="button"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-[var(--brand-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-9"
            >
              {isLastStep ? "Concluir" : "Próximo"}
              {isLastStep ? <Check className="size-4" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}
