import { cn } from "@/lib/utils";

export function FilterChip({
  active,
  children,
  onClick,
  count,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
          : "border-[var(--border)] bg-white text-[var(--ink)] hover:bg-[var(--page)]",
      )}
    >
      {children}
      {typeof count === "number" ? <span className="ml-1.5 tabular opacity-80">{count}</span> : null}
    </button>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
