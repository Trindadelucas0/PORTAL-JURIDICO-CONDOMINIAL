"use client";

export type AiAuditRow = {
  id: string;
  action: string;
  result: string;
  createdAt: string;
};

const LABELS: Record<string, string> = {
  AI_STARTED: "Job criado",
  CONTEXT_RESOLVED: "Contexto resolvido",
  RAG_SEARCHED: "RAG executado",
  AI_GENERATED_DRAFT: "Rascunho gerado",
  AI_GENERATED_INTERNAL_ANALYSIS: "LLM chamado",
  ACTION_BLOCKED: "Validação do gate",
  ABSTAIN: "Abstenção",
  REJECTED: "Rejeitado",
  APPROVED: "Aprovado",
  MEMORY_CREATED: "Memória gravada",
  JOB_RETRIED: "Job repetido",
  JOB_DEAD: "Job encerrado",
  STALE_CONTEXT: "Contexto divergente",
  AI_AUTO_SENT: "Enviado automaticamente",
  AI_PROMOTED_TRIAGE: "Triagem promovida",
};

export function AiAuditPanel({
  loading,
  error,
  events,
  tokensToday,
}: {
  loading?: boolean;
  error?: boolean;
  events: AiAuditRow[];
  tokensToday?: number;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Carregando auditoria…</p>;
  if (error) return <p className="text-sm text-muted-foreground">Não foi possível carregar a auditoria.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Tokens hoje neste chamado: <span className="tabular font-medium">{tokensToday ?? 0}</span>
      </p>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento de IA neste chamado.</p>
      ) : (
        <ol className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="border-b border-border py-2 text-sm">
              <p className="font-medium">{LABELS[event.action] || event.action}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString("pt-BR")} · {event.result}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
