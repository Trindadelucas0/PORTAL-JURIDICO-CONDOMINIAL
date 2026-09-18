import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconTileVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center align-middle size-(--icon-tile-size) rounded-(--icon-tile-radius) [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-(--icon-tile-icon-size)",
  {
    variants: {
      variant: {
        outline: "border border-border bg-background",
        elevated: "border-2 border-background bg-muted text-accent-foreground shadow-sm",
        soft: "bg-primary/10 text-primary",
        solid: "bg-primary text-primary-foreground",
        frame: "border border-border bg-muted/50",
      },
      size: {
        xs: "[--icon-tile-size:1.5rem] [--icon-tile-icon-size:0.875rem]",
        sm: "[--icon-tile-size:2rem] [--icon-tile-icon-size:1rem]",
        default: "[--icon-tile-size:2.5rem] [--icon-tile-icon-size:1.125rem]",
        lg: "[--icon-tile-size:3rem] [--icon-tile-icon-size:1.375rem]",
        xl: "[--icon-tile-size:3.5rem] [--icon-tile-icon-size:1.75rem]",
      },
      radius: {
        default: "[--icon-tile-radius:0.5rem]",
        full: "[--icon-tile-radius:999px]",
      },
    },
    defaultVariants: { variant: "outline", size: "default", radius: "default" },
  },
);

function IconTile({
  className,
  variant = "outline",
  size = "default",
  radius = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof iconTileVariants>) {
  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(
      {
        className: cn(iconTileVariants({ variant, size, radius }), className),
      },
      props,
    ),
  });
}

export { IconTile, iconTileVariants };
