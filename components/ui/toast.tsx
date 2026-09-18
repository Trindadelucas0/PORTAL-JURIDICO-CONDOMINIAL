"use client";

import { toast } from "sonner";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useToast() {
  return (message: string) => {
    toast(message);
  };
}
