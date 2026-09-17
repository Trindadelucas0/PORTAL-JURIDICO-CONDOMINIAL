export const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando: "Aguardando",
  resolvido: "Resolvido",
  arquivado: "Arquivado",
  promovido: "Promovido",
};

export const PRIORITY_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const CATEGORY_LABEL: Record<string, string> = {
  cobranca: "Cobrança",
  assembleia: "Assembleia",
  obras: "Obras",
  vizinhanca: "Vizinhança",
  administrativo: "Administrativo",
  outro: "Outro",
};

export const CATEGORIES = ["cobranca", "assembleia", "obras", "vizinhanca", "administrativo", "outro"] as const;
export const PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
export const TICKET_STATUSES = ["aberto", "em_andamento", "aguardando", "resolvido"] as const;

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
