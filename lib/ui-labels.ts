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
  media: "Média",
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

export const STATUS_TONE: Record<string, { bar: string; pill: string; header: string; count: string; column: string }> = {
  aberto: {
    bar: "bg-[var(--status-aberto)]",
    pill: "border border-[#bfdbfe] bg-[var(--status-aberto-bg)] text-[var(--status-aberto)]",
    header: "bg-[var(--status-aberto-bg)] text-[var(--status-aberto)]",
    count: "bg-[var(--status-aberto)] text-white",
    column: "bg-[color-mix(in_srgb,var(--status-aberto)_8%,white)]",
  },
  em_andamento: {
    bar: "bg-[var(--status-andamento)]",
    pill: "border border-[#fde68a] bg-[var(--status-andamento-bg)] text-[var(--status-andamento)]",
    header: "bg-[var(--status-andamento-bg)] text-[var(--status-andamento)]",
    count: "bg-[var(--status-andamento)] text-white",
    column: "bg-[color-mix(in_srgb,var(--status-andamento)_8%,white)]",
  },
  aguardando: {
    bar: "bg-[var(--status-aguardando)]",
    pill: "border border-border bg-[var(--status-aguardando-bg)] text-[var(--status-aguardando)]",
    header: "bg-[var(--status-aguardando-bg)] text-[var(--status-aguardando)]",
    count: "bg-[var(--status-aguardando)] text-white",
    column: "bg-[color-mix(in_srgb,var(--status-aguardando)_8%,white)]",
  },
  resolvido: {
    bar: "bg-[var(--status-resolvido)]",
    pill: "border border-[#a7f3d0] bg-[var(--status-resolvido-bg)] text-[var(--status-resolvido)]",
    header: "bg-[var(--status-resolvido-bg)] text-[var(--status-resolvido)]",
    count: "bg-[var(--status-resolvido)] text-white",
    column: "bg-[color-mix(in_srgb,var(--status-resolvido)_8%,white)]",
  },
  promovido: {
    bar: "bg-[var(--status-resolvido)]",
    pill: "border border-[#a7f3d0] bg-[var(--status-resolvido-bg)] text-[var(--status-resolvido)]",
    header: "bg-[var(--status-resolvido-bg)] text-[var(--status-resolvido)]",
    count: "bg-[var(--status-resolvido)] text-white",
    column: "bg-[color-mix(in_srgb,var(--status-resolvido)_8%,white)]",
  },
  arquivado: {
    bar: "bg-[var(--status-arquivado)]",
    pill: "bg-[var(--status-arquivado-bg)] text-[var(--status-arquivado)]",
    header: "bg-[var(--status-arquivado-bg)] text-[var(--status-arquivado)]",
    count: "bg-[var(--status-arquivado)] text-white",
    column: "bg-[var(--surface-2)]",
  },
};

export const PRIORITY_TONE: Record<string, { bar: string; pill: string }> = {
  urgente: {
    bar: "bg-[var(--priority-urgente)]",
    pill: "border border-red-200 bg-red-50 text-[var(--priority-urgente)]",
  },
  alta: {
    bar: "bg-[var(--priority-alta)]",
    pill: "border border-orange-200 bg-orange-50 text-[var(--priority-alta)]",
  },
  media: {
    bar: "bg-[var(--priority-media)]",
    pill: "border border-border bg-secondary text-[var(--priority-media)]",
  },
  baixa: {
    bar: "bg-[var(--priority-baixa)]",
    pill: "border border-border bg-card text-[var(--priority-baixa)]",
  },
};

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatAge(iso?: string | null) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
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

export const INGEST_STATUS_LABEL: Record<string, string> = {
  stored: "Arquivado",
  pending_index: "Aguardando indexação",
  indexed: "Indexado",
  failed: "Falhou",
  skipped: "Ignorado",
};
