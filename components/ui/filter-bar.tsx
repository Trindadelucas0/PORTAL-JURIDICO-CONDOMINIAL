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
      aria-pressed={Boolean(active)}
      className={cn(
        "min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium transition-[background-color,border-color,color] duration-[var(--motion-fast)]",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-sm)]"
          : "border-border-strong bg-card text-foreground hover:border-primary/40 hover:bg-secondary",
      )}
    >
      {children}
      {typeof count === "number" ? <span className="ml-1.5 tabular opacity-80">{count}</span> : null}
    </button>
  );
}

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
