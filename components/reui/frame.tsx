"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const frameVariants = cva("relative flex flex-col gap-0 rounded-[var(--frame-radius,10px)]", {
  variants: {
    variant: {
      default: "border border-border bg-card shadow-[var(--shadow-sm)]",
      ghost: "border-0 bg-transparent p-0 shadow-none",
    },
    dense: {
      true: "gap-0 p-0",
      false: "",
    },
  },
  defaultVariants: { variant: "default", dense: false },
});

function Frame({
  className,
  variant,
  dense,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof frameVariants>) {
  return <div data-slot="frame" className={cn(frameVariants({ variant, dense }), className)} {...props} />;
}

function FramePanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="frame-panel"
      className={cn("grow overflow-hidden rounded-[var(--frame-radius,10px)] bg-card", className)}
      {...props}
    />
  );
}

function FrameHeader({ className, ...props }: React.ComponentProps<"header">) {
  return <header data-slot="frame-panel-header" className={cn("flex flex-col gap-1 px-4 py-3", className)} {...props} />;
}

function FrameTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="frame-panel-title" className={cn("text-sm font-semibold", className)} {...props} />;
}

function FrameDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="frame-panel-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function FrameFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return <footer data-slot="frame-panel-footer" className={cn("flex flex-col gap-2 px-4 py-3", className)} {...props} />;
}

export { Frame, FramePanel, FrameHeader, FrameTitle, FrameDescription, FrameFooter, frameVariants };
