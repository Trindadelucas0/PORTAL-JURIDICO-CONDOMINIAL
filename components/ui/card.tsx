import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm", className)}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "ok" | "warn" | "danger" | "wa" | "dev";
}) {
  const map = {
    muted: "bg-[var(--page)] text-[var(--muted)]",
    ok: "bg-green-50 text-[var(--ok)]",
    warn: "bg-amber-50 text-[var(--warn)]",
    danger: "bg-red-50 text-[var(--danger)]",
    wa: "bg-[#128c7e]/10 text-[var(--channel-whatsapp)]",
    dev: "bg-[var(--brand)] text-white",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[12px] bg-[var(--border)]", className)} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-[var(--border)] p-8 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[12px] border border-[var(--danger)]/30 bg-red-50 px-4 py-3 text-sm text-[var(--danger)] flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="underline" onClick={onRetry}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}
