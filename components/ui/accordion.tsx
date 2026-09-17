"use client";

import { useState } from "react";

export function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-[var(--border)]">
      <button
        type="button"
        className="flex w-full items-center justify-between py-3 text-left text-sm font-medium"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        <span className="text-[var(--muted)]">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="pb-4">{children}</div> : null}
    </div>
  );
}
