import Link from "next/link";
import { cn } from "@/lib/utils";

export type AttentionItem = {
  href: string;
  label: string;
  value: number;
  verb: string;
};

export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-label="Agora" className="border-b border-border px-4 py-3">
      <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Agora</h2>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {items.map((item) => {
          const hot = item.value > 0;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "group min-w-0 rounded-md px-0.5 py-0.5 outline-none transition-colors duration-[var(--motion-fast)]",
                "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
                !hot && "opacity-50",
              )}
            >
              <span className="block text-xl font-semibold tabular tracking-tight text-foreground">{item.value}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground group-hover:text-foreground">{item.label}</span>
              <span className="mt-0.5 block text-xs font-medium text-[var(--brand)]">
                {hot ? `${item.verb} →` : "—"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
