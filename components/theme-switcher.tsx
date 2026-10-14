"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES, THEME_STORAGE_KEY, DEFAULT_THEME, type ThemeId } from "@/lib/themes";

const listeners = new Set<() => void>();

function readTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const t = document.documentElement.dataset.theme as ThemeId | undefined;
  return t && THEMES.some((x) => x.id === t) ? t : DEFAULT_THEME;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    applyTheme((e.newValue as ThemeId) || DEFAULT_THEME, false);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function applyTheme(id: ThemeId, persist = true) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.primary);
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    } catch {}
  }
  listeners.forEach((l) => l());
}

export function useColorTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
  const setTheme = useCallback((id: ThemeId) => applyTheme(id), []);
  return { theme, setTheme };
}

export function ThemeSwatch({ primary, accent, className }: { primary: string; accent: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10", className)}
      style={{ background: `linear-gradient(135deg, ${primary} 0 58%, ${accent} 58% 100%)` }}
    />
  );
}

/** Grade de 4 amostras — usada no menu do usuário e na folha "Mais" (mobile). */
export function ThemeSwatchGrid({ className, onPicked }: { className?: string; onPicked?: () => void }) {
  const { theme, setTheme } = useColorTheme();
  return (
    <div role="radiogroup" aria-label="Tema de cores" className={cn("grid grid-cols-2 gap-2", className)}>
      {THEMES.map((t) => {
        const active = t.id === theme;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-theme-option={t.id}
            onClick={() => {
              setTheme(t.id);
              onPicked?.();
            }}
            className={cn(
              "group flex min-h-11 items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 text-left text-xs font-medium text-foreground transition-[border-color,box-shadow] duration-[var(--motion-fast)] outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:border-border-strong",
            )}
          >
            <span className="relative">
              <ThemeSwatch primary={t.primary} accent={t.accent} className="size-7" />
              {active ? (
                <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span className="leading-tight">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ThemeSectionTitle() {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      <Palette className="size-3.5" /> Tema de cores
    </p>
  );
}
