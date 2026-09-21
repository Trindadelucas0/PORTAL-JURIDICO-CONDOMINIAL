"use client";

import * as React from "react";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { e164ToMaskedInput, formatPhoneInput, toE164FromMasked } from "@/lib/phone/mask";

export function PhoneInput({
  id,
  label,
  value,
  onChange,
  required,
  readOnly,
  hint,
  className,
  placeholder = "+55 (11) 9XXXX-XXXX",
  action,
}: {
  id?: string;
  label?: string;
  /** E.164 or masked display string; component normalizes on change. */
  value: string;
  onChange: (masked: string) => void;
  required?: boolean;
  readOnly?: boolean;
  hint?: string;
  className?: string;
  placeholder?: string;
  /** Optional control beside the input (e.g. Puxar do WhatsApp). */
  action?: React.ReactNode;
}) {
  const display = value.startsWith("+55 (") || value === "" ? value : e164ToMaskedInput(value);

  return (
    <div className={cn("space-y-1", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <div className={cn(action ? "flex flex-col gap-2 sm:flex-row sm:items-end" : undefined)}>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required={required}
          readOnly={readOnly}
          value={display}
          placeholder={placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(readOnly && "bg-muted/40", action && "sm:flex-1")}
          onChange={(e) => {
            if (readOnly) return;
            onChange(formatPhoneInput(e.target.value));
          }}
        />
        {action ? <div className="shrink-0 sm:w-auto [&_button]:w-full sm:[&_button]:w-auto">{action}</div> : null}
      </div>
      {hint ? (
        <p id={id ? `${id}-hint` : undefined} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Helper for submit: masked → E.164 or null. */
export function phoneInputToE164(masked: string): string | null {
  return toE164FromMasked(masked);
}
