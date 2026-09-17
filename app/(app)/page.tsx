"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ErrorBanner } from "@/components/ui/error-state";
import { ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Accordion } from "@/components/ui/accordion";
import { api } from "@/lib/client/api";
import { formatWhen } from "@/lib/ui-labels";
import { humanSessionStatus } from "@/components/conexoes/whatsapp-session-card";
import { cn } from "@/lib/utils";

type Dashboard = {
  triagem: number;
  naoIdent: number;
  enviosFalhos: number;
  prazosVencidos: number;
  prazosProximos?: number;
  meusChamados?: number;
  abertos?: number;
  emAndamento?: number;
  aguardando?: number;
  semResponsavel?: number;
  altaUrgente?: number;
  rascunhos?: number;
  conexao: { status: string; type: string; label: string } | null;
  recent: Array<{
    id: string;
    unidentified: boolean;
    updatedAt: string;
    peerPhoneE164?: string;
    contact: { nome: string } | null;
    condominium: { nome: string } | null;
  }>;
  connections: Array<{ id: string; status: string; type: string; label: string }>;
};

export default function DashboardPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/api/dashboard"),
  });

  if (q.isError) {
    const status = (q.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState message="Sem permissão para os indicadores operacionais." />;
    return <ErrorBanner message="Não foi possível carregar o dashboard." onRetry={() => q.refetch()} />;
  }

  const data = q.data?.data;
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  const employee = typeof data?.meusChamados === "number";
  const wa = data?.conexao ? humanSessionStatus(data.conexao.status) : null;

  return (
    <div>
      <PageHeader title="Visão geral" description={`Operação do escritório · ${today}`} />
      {q.isLoading || !data ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Atenção</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {!employee ? (
                <Attention href="/triagem" label="Triagem" value={data.triagem} hint="aguardando análise" />
              ) : (
                <Attention href="/chamados" label="Meus chamados" value={data.meusChamados ?? 0} hint="em aberto" />
              )}
              <Attention href="/prazos?overdue=1" label="Prazos" value={data.prazosVencidos} hint="vencidos" />
              <Attention href="/chamados?status=em_andamento" label="Chamados" value={data.emAndamento ?? 0} hint="em andamento" />
            </div>
          </section>
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Entradas recentes</h2>
                <Link href="/atendimento" className="text-sm text-[var(--brand)]">
                  Ver todas
                </Link>
              </div>
              {data.recent.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nenhuma conversa ainda.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {data.recent.map((row) => (
                    <li key={row.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        {row.unidentified ? "Não identificado" : row.contact?.nome || "Conversa"}
                        {row.unidentified && row.peerPhoneE164 ? (
                          <span className="text-[var(--muted)]"> · {row.peerPhoneE164}</span>
                        ) : null}
                        {row.condominium?.nome ? (
                          <span className="text-[var(--muted)]"> · {row.condominium.nome}</span>
                        ) : null}
                      </span>
                      <time className="shrink-0 tabular text-[var(--muted)]">{formatWhen(row.updatedAt)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Minha operação</h2>
              <ul className="space-y-2 text-sm">
                <li>{data.abertos ?? 0} chamados abertos</li>
                <li>{data.prazosProximos ?? 0} prazos próximos (72h)</li>
                <li>{data.enviosFalhos} envios falhos</li>
                {!employee && (data.semResponsavel ?? 0) > 0 ? <li>{data.semResponsavel} sem responsável</li> : null}
              </ul>
              <Link href="/chamados" className="mt-4 inline-block text-sm text-[var(--brand)]">
                Abrir minha operação
              </Link>
            </section>
          </div>
          {wa ? (
            <section className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
              <p className="text-sm">
                <span
                  className={cn(
                    "mr-2 inline-block h-2 w-2 rounded-full",
                    wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-[var(--muted)]",
                  )}
                />
                WhatsApp {wa.label}
              </p>
              <Link href="/conexoes" className="text-sm text-[var(--brand)]">
                Gerenciar conexão
              </Link>
            </section>
          ) : null}
          <Accordion title="Mais indicadores">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>Não identificados: {data.naoIdent}</div>
              <div>Envios falhos: {data.enviosFalhos}</div>
              <div>Alta/urgente: {data.altaUrgente ?? 0}</div>
              <div>Aguardando: {data.aguardando ?? 0}</div>
            </dl>
          </Accordion>
        </div>
      )}
    </div>
  );
}

function Attention({ href, label, value, hint }: { href: string; label: string; value: number; hint: string }) {
  return (
    <Link href={href} className="block rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--brand)]/30">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular">{value}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p>
    </Link>
  );
}
