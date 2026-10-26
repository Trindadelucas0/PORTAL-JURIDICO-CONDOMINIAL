import { cn } from "@/lib/utils";

export function WorkspaceShell({
  children,
  className,
  cols = "inbox",
  contextOpen = true,
  contextWide = false,
}: {
  children: React.ReactNode;
  className?: string;
  cols?: "inbox" | "triage" | "two" | "unlinked";
  contextOpen?: boolean;
  contextWide?: boolean;
}) {
  const grid =
    cols === "inbox"
      ? contextOpen
        ? cn(
            "grid-cols-[minmax(0,1fr)_200px] lg:transition-[grid-template-columns] lg:duration-[var(--motion-normal)] lg:ease-[var(--ease-out)]",
            // A conversa (coluna do meio) nunca fica abaixo de 320px: 280px da lista + 320px.
            contextWide
              ? "lg:grid-cols-[280px_minmax(0,1fr)_max(300px,min(640px,calc(100%_-_600px)))]"
              : "lg:grid-cols-[280px_minmax(0,1fr)_300px]",
          )
        : "grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]"
      : cols === "unlinked"
        ? "grid-cols-[minmax(0,1fr)_200px] lg:grid-cols-[280px_minmax(0,1fr)_240px]"
      : cols === "triage"
        ? "lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]"
        : "lg:grid-cols-[240px_minmax(0,1fr)]";

  return (
    <div
      data-slot="workspace-shell"
      className={cn(
        "grid min-h-0 flex-1 overflow-hidden divide-x divide-border bg-card",
        grid,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WorkspacePane({
  children,
  className,
  hidden,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  hidden?: boolean;
}) {
  return (
    <div
      data-slot="workspace-pane"
      className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden", hidden && "hidden lg:flex", className)}
      {...props}
    >
      {children}
    </div>
  );
}
