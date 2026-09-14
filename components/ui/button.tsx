import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[14px] text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-[var(--brand)] text-white hover:bg-[var(--brand-soft)] px-4 py-2.5",
        secondary:
          "bg-white text-[var(--ink)] border border-[var(--border)] hover:bg-[var(--page)] px-4 py-2.5",
        ghost: "text-[var(--muted)] hover:bg-white/70 px-3 py-2",
        danger: "bg-[var(--danger)] text-white px-4 py-2.5",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, ...props }: Props) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
