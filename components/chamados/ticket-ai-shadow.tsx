import { Skeleton } from "@/components/ui/skeleton";
import type { CopilotRevisionView } from "@/lib/ai/copilot-view";

export function TicketAiShadow({
  loading,
  error,
  analyzing,
  current,
}: {
  loading: boolean;
  error: boolean;
  analyzing: boolean;
  current: CopilotRevisionView | null;
}) {
  const ambiguous = current?.tecnica.motivoEscalonamento === "chamados_ambiguos";
  return (
    <section className="mb-4 rounded-[var(--radius)] border border-border p-3" aria-label="Análise interna">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Análise interna</h2>
        <span className="text-xs text-muted-foreground">
          {analyzing ? "Gerando" : ambiguous ? "Ambíguo" : current ? "Rascunho" : "Sem análise"}
        </span>
      </div>
      {loading ? <Skeleton className="mt-3 h-16" /> : null}
      {!loading && error ? (
        <p className="mt-2 text-sm text-muted-foreground">IA indisponível — equipe segue o caso</p>
      ) : null}
      {!loading && !error && ambiguous ? (
        <p className="mt-2 text-sm">Mais de um chamado aberto</p>
      ) : null}
      {!loading && !error && !ambiguous && !current && !analyzing ? (
        <p className="mt-2 text-sm text-muted-foreground">Sem análise</p>
      ) : null}
      {!loading && !error && !ambiguous && current ? (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Fontes</p>
            {current.fontes.length === 0 ? (
              <p>Nenhuma fonte</p>
            ) : (
              <ul>
                {current.fontes.map((fonte) => (
                  <li key={`${fonte.titulo}-${fonte.pagina}`}>
                    {fonte.titulo}
                    {fonte.pagina != null ? ` · p. ${fonte.pagina}` : ""}
                    {fonte.similaridade != null ? ` · ${fonte.similaridade}%` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rascunho ao cliente (não enviado)</p>
            <p>{current.resposta.texto || "Sem rascunho"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Análise da equipe (não vai ao WhatsApp)</p>
            <p>{current.analise || "Sem análise interna"}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
