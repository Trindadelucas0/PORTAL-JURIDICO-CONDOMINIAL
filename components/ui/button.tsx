import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-medium transition-[background-color,opacity] duration-150 disabled:opacity-50 disabled:pointer-events-none min-h-10",
  {
    variants: {
      variant: {
        primary: "bg-[var(--brand)] text-white hover:bg-[var(--brand-soft)] px-4 py-2",
        secondary:
          "bg-white text-[var(--ink)] border border-[var(--border)] hover:bg-[var(--page)] px-4 py-2",
        ghost: "text-[var(--muted)] hover:bg-black/5 px-3 py-2",
        danger: "bg-[var(--danger)] text-white px-4 py-2 hover:opacity-90",
      },
      size: {
        default: "",
        sm: "min-h-8 px-3 py-1.5 text-xs",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: Props) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
