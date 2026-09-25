"use client";

import { ReactNode } from "react";

export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animar-entrada flex min-h-0 flex-1 flex-col h-full">{children}</div>;
}
