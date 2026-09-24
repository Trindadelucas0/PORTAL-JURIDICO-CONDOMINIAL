import Link from "next/link";
import { cn } from "@/lib/utils";

export type AttentionTone = "danger" | "warn" | "info" | "neutral";

export type AttentionItem = {
  href: string;
  label: string;
  value: number;
  verb: string;
  detail?: string;
  tone?: AttentionTone;
};

const CARD: Record<AttentionTone, string> = {
  danger: "border-l-[var(--danger)] hover:border-red-200",
  warn: "border-l-[var(--warn)] hover:border-amber-200",
  info: "border-l-[var(--status-aberto)] hover:border-blue-200",
  neutral: "border-l-[var(--status-aguardando)] hover:border-slate-300",
};

const BUBBLE: Record<AttentionTone, string> = {
  danger: "border-red-200 bg-red-50 text-[var(--danger)]",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  neutral: "border-slate-200 bg-slate-100 text-slate-600",
};

export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-label="Atenção" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          <span className="size-1.5 rounded-full bg-[var(--danger)]" aria-hidden />
          Atenção · Prioridades
        </h2>
        <span className="text-xs text-muted-foreground">
          {items.length === 0 ? "Nada crítico" : `${items.length} pendência${items.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-border bg-card px-4 py-4 text-sm text-muted-foreground">
          Nada exige atenção agora.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const tone = item.tone ?? "neutral";
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={cn(
                    "block rounded-[var(--radius)] border border-border border-l-4 bg-card p-3.5 transition-colors duration-[var(--motion-fast)]",
                    CARD[tone],
                  )}
                >
                  <span className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular",
                        BUBBLE[tone],
                      )}
                    >
                      {item.value}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-foreground">{item.label}</span>
                      {item.detail ? (
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.detail}</span>
                      ) : null}
                      <span className="mt-2.5 flex items-center justify-end border-t border-slate-100 pt-2">
                        <span className="text-xs font-semibold text-primary">{item.verb} →</span>
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
