import { formatWhen } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  at: string;
  kind: "message" | "system";
  body: string;
  label?: string;
  tone?: "interna" | "in" | "out";
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">Sem atividade ainda.</p>;
  }
  return (
    <ol className="space-y-3">
      {items.map((item) =>
        item.kind === "message" ? (
          <li
            key={item.id}
            className={cn(
              "rounded-[12px] border p-3 shadow-[var(--shadow)]",
              item.tone === "interna"
                ? "border-[color-mix(in_srgb,var(--warn)_35%,var(--border))] bg-amber-50"
                : item.tone === "in"
                  ? "border-[var(--border)] border-l-[3px] border-l-[var(--channel-whatsapp)] bg-[var(--card)]"
                  : "border-[var(--border)] bg-[var(--card)]",
            )}
          >
            <div className="mb-1.5 flex items-start justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              <span>{item.label ?? "WhatsApp"}</span>
              <time className="tabular font-normal normal-case tracking-normal" dateTime={item.at}>
                {formatWhen(item.at)}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">{item.body}</p>
          </li>
        ) : (
          <li key={item.id} className="grid grid-cols-[1fr_auto] gap-3 text-xs text-[var(--muted)]">
            <span>{item.body}</span>
            <time className="tabular" dateTime={item.at}>
              {formatWhen(item.at)}
            </time>
          </li>
        ),
      )}
    </ol>
  );
}
