"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActivityRow } from "@/components/workspace/activity-row";
import { api } from "@/lib/client/api";
import { formatAge } from "@/lib/ui-labels";
import { humanSessionStatus } from "@/components/conexoes/whatsapp-session-card";
import { cn } from "@/lib/utils";

type Dashboard = {
  triagem: number;
  naoIdent: number;
  naoVinculados?: number;
  naoLidas?: number;
  enviosFalhos: number;
  meusChamados?: number;
  abertos?: number;
  emAndamento?: number;
  aguardando?: number;
  semResponsavel?: number;
  altaUrgente?: number;
  rascunhos?: number;
  prazosProximos?: number;
  prazosVencidos?: number;
  meusChamadosLista?: Array<{
    id: string;
    protocol: string;
    title: string;
    status: string;
    updatedAt: string;
    condominium: { nome: string };
    contact?: { nome: string };
  }>;
  conexao: { status: string; type: string; label: string } | null;
  recent: Array<{
    id: string;
    unidentified: boolean;
    updatedAt: string;
    peerPhoneE164?: string;
    contact: { nome: string } | null;
    condominium: { nome: string } | null;
  }>;
};

type ActionBlock = {
  href: string;
  label: string;
  meaning: string;
  verb: string;
  count: number;
};

function clock(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return formatAge(iso) ?? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/api/dashboard"),
  });
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short", year: "numeric" }),
    );
  }, []);

  if (q.isError) {
    const status = (q.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState message="Sem permissão para os indicadores operacionais." />;
    return (
      <div className="p-4">
        <ErrorBanner message="Não foi possível carregar a visão operacional." onRetry={() => q.refetch()} />
      </div>
    );
  }

  const data = q.data?.data;
  const employee = typeof data?.meusChamados === "number";
  const wa = data?.conexao ? humanSessionStatus(data.conexao.status) : null;
  const unlinked = data?.naoVinculados ?? data?.naoIdent ?? 0;

  const blocks: ActionBlock[] = [];
  if (data) {
    if (!employee) {
      if (unlinked > 0)
        blocks.push({
          href: "/nao-vinculados",
          label: "Não vinculados",
          meaning: "Número sem cadastro. Vincular para abrir triagem.",
          verb: "Identificar",
          count: unlinked,
        });
      if (data.triagem > 0)
        blocks.push({
          href: "/triagem",
          label: "Triagem",
          meaning: "Pedido classificado? Criar chamado ou arquivar.",
          verb: "Analisar",
          count: data.triagem,
        });
      if ((data.semResponsavel ?? 0) > 0)
        blocks.push({
          href: "/chamados?unassigned=1",
          label: "Sem responsável",
          meaning: "Chamado parado sem dono.",
          verb: "Atribuir",
          count: data.semResponsavel ?? 0,
        });
    }
    if ((data.naoLidas ?? 0) > 0)
      blocks.push({
        href: "/atendimento",
        label: "Não lidas",
        meaning: "Mensagem nova no Atendimento.",
        verb: "Atender",
        count: data.naoLidas ?? 0,
      });
    if ((data.abertos ?? 0) > 0)
      blocks.push({
        href: "/chamados",
        label: employee ? "Meus abertos" : "Abertos",
        meaning: "Chamado ainda não em andamento.",
        verb: "Operar",
        count: data.abertos ?? 0,
      });
    if ((data.emAndamento ?? 0) > 0)
      blocks.push({
        href: "/chamados",
        label: "Em andamento",
        meaning: "Trabalho em curso.",
        verb: "Seguir",
        count: data.emAndamento ?? 0,
      });
    if ((data.aguardando ?? 0) > 0)
      blocks.push({
        href: "/chamados",
        label: "Aguardando",
        meaning: "Esperando cliente, documento ou retorno.",
        verb: "Cobrar",
        count: data.aguardando ?? 0,
      });
    if ((data.prazosVencidos ?? 0) > 0)
      blocks.push({
        href: "/prazos?overdue=1",
        label: "Prazos vencidos",
        meaning: "Data interna passou e o prazo não foi concluído.",
        verb: "Resolver",
        count: data.prazosVencidos ?? 0,
      });
    else if ((data.prazosProximos ?? 0) > 0)
      blocks.push({
        href: "/prazos?dueSoon=1",
        label: "Prazos próximos",
        meaning: "Vencem nas próximas 72 horas.",
        verb: "Ver prazos",
        count: data.prazosProximos ?? 0,
      });
    if ((data.rascunhos ?? 0) > 0)
      blocks.push({
        href: "/atendimento",
        label: "Rascunhos",
        meaning: "Mensagem pública aguardando aprovação do admin.",
        verb: "Revisar",
        count: data.rascunhos ?? 0,
      });
    if (data.enviosFalhos > 0)
      blocks.push({
        href: employee ? "/atendimento" : "/conexoes",
        label: "Envios falhos",
        meaning: "WhatsApp recusou ou a sessão estava fechada.",
        verb: "Revisar",
        count: data.enviosFalhos,
      });
  }

  return (
    <div className="min-h-[calc(100dvh-3rem)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">Visão</h1>
          <p className="text-xs text-muted-foreground">O que precisa de ação agora{today ? ` · ${today}` : ""}</p>
        </div>
        {wa ? (
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide" aria-label={`WhatsApp ${wa.label}`}>
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
              )}
            />
            <span className={wa.tone === "ok" ? "text-foreground" : "text-muted-foreground"}>{wa.label}</span>
          </p>
        ) : null}
      </header>
      {q.isLoading || !data ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          <section className="border-b border-border px-4 py-3" aria-label="Fila de ação">
            <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Agora</h2>
            {blocks.length === 0 ? (
              <EmptyState title="Tudo limpo" hint="Nada aguardando decisão nesta sessão." />
            ) : (
              <ul className="mt-1">
                {blocks.map((row) => (
                  <li key={row.label}>
                    <Link
                      href={row.href}
                      className="flex items-baseline gap-3 border-b border-border/60 py-2.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-muted/40"
                    >
                      <span className="w-8 shrink-0 text-right text-base font-semibold tabular text-foreground">
                        {row.count}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{row.label}</span>
                        <span className="block text-xs text-muted-foreground">{row.meaning}</span>
                      </span>
                      <span className="text-xs font-medium text-[var(--brand)]">{row.verb} →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="grid gap-0 lg:grid-cols-2">
            <section className="border-b border-border p-4 lg:border-r" aria-label="Minha operação">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Minha operação
                </h2>
                <Link href="/chamados" className="text-xs font-medium text-[var(--brand)]">
                  Chamados →
                </Link>
              </div>
              {(data.meusChamadosLista ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nenhum chamado em aberto.</p>
              ) : (
                <ul className="mt-2">
                  {(data.meusChamadosLista ?? []).map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/chamados/${t.id}`}
                        className="flex items-center gap-2 border-b border-border/60 py-2 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-muted/40"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium tabular">#{t.protocol}</span>
                          {t.contact?.nome ? (
                            <span className="text-muted-foreground"> · {t.contact.nome}</span>
                          ) : null}
                        </span>
                        <StatusBadge status={t.status} />
                        <span className="hidden max-w-[7rem] truncate text-xs text-muted-foreground sm:inline">
                          {t.condominium.nome}
                        </span>
                        <time className="w-8 shrink-0 text-right tabular text-xs text-muted-foreground">
                          {formatAge(t.updatedAt) ?? "—"}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="border-b border-border p-4" aria-label="Atividade">
              <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Atividade</h2>
              {data.recent.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma conversa recente.</p>
              ) : (
                <ul className="mt-2">
                  {data.recent.map((row) => (
                    <li key={row.id}>
                      <ActivityRow
                        variant="log"
                        href="/atendimento"
                        when={clock(row.updatedAt)}
                        primary={row.contact?.nome || "Conversa"}
                        secondary={row.condominium?.nome || undefined}
                        trailing="Atendimento →"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
