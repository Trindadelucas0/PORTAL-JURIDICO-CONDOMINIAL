import { cn } from "@/lib/utils";

const map = {
  muted: "bg-[var(--page)] text-[var(--muted)]",
  ok: "bg-green-50 text-[var(--ok)]",
  warn: "bg-amber-50 text-[var(--warn)]",
  danger: "bg-red-50 text-[var(--danger)]",
  wa: "bg-[#128c7e]/10 text-[var(--channel-whatsapp)]",
  dev: "bg-[var(--brand)] text-white",
};

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof map;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        map[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
