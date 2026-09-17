import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)] min-h-10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
