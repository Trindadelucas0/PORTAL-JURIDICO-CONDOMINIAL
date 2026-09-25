import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow-sm)] transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, EmptyState, ErrorBanner, Skeleton };
