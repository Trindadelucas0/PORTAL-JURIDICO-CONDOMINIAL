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

export const STATUS_TONE: Record<string, { bar: string; pill: string }> = {
  aberto: {
    bar: "bg-[var(--status-aberto)]",
    pill: "bg-[var(--status-aberto-bg)] text-[var(--status-aberto)]",
  },
  em_andamento: {
    bar: "bg-[var(--status-andamento)]",
    pill: "bg-[var(--status-andamento-bg)] text-[var(--status-andamento)]",
  },
  aguardando: {
    bar: "bg-[var(--status-aguardando)]",
    pill: "bg-[var(--status-aguardando-bg)] text-[var(--status-aguardando)]",
  },
  resolvido: {
    bar: "bg-[var(--status-resolvido)]",
    pill: "bg-[var(--status-resolvido-bg)] text-[var(--status-resolvido)]",
  },
  arquivado: {
    bar: "bg-[var(--status-arquivado)]",
    pill: "bg-[var(--status-arquivado-bg)] text-[var(--status-arquivado)]",
  },
};

export const PRIORITY_TONE: Record<string, { bar: string; pill: string }> = {
  urgente: {
    bar: "bg-[var(--priority-urgente)]",
    pill: "bg-red-50 text-[var(--priority-urgente)]",
  },
  alta: {
    bar: "bg-[var(--priority-alta)]",
    pill: "bg-orange-50 text-[var(--priority-alta)]",
  },
  media: {
    bar: "bg-[var(--priority-media)]",
    pill: "bg-slate-100 text-[var(--priority-media)]",
  },
  baixa: {
    bar: "bg-[var(--priority-baixa)]",
    pill: "bg-slate-50 text-[var(--priority-baixa)]",
  },
};

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
