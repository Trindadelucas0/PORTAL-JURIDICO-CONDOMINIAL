export const THEME_STORAGE_KEY = "juricon-theme";

export const THEMES = [
  { id: "marinho-dourado", label: "Marinho e dourado", primary: "#1E3A5F", accent: "#C9A227" },
  { id: "verde-petroleo", label: "Verde-petróleo", primary: "#0F5E66", accent: "#14B8A6" },
  { id: "vinho-areia", label: "Vinho e areia", primary: "#6B1F2A", accent: "#B08D57" },
  { id: "azul-royal", label: "Azul royal", primary: "#2563EB", accent: "#0EA5E9" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "marinho-dourado";

/** Executado inline no <head>, antes da pintura, para evitar flash de tema. */
export const THEME_INIT_SCRIPT = `(function(){try{var ids=${JSON.stringify(THEMES.map((t) => t.id))};var c=${JSON.stringify(
  Object.fromEntries(THEMES.map((t) => [t.id, t.primary])),
)};var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(ids.indexOf(t)<0)t=${JSON.stringify(
  DEFAULT_THEME,
)};document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[t]);}catch(e){}})();`;
