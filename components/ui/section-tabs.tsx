"use client";

import { cn } from "@/lib/utils";

export type SectionTab = {
  id: string;
  label: string;
  count?: number;
};

export function SectionTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Seções"
      className={cn("flex flex-wrap gap-0 border-b border-border", className)}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            className={cn(
              "relative min-h-11 px-3 py-2 text-sm transition-colors duration-[var(--motion-fast)]",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className="ml-1.5 tabular text-xs text-muted-foreground">{tab.count}</span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-3 -bottom-px h-0.5 bg-[var(--brand)]" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTabPanel({
  id,
  active,
  children,
  className,
}: {
  id: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className={className}
    >
      {children}
    </div>
  );
}
