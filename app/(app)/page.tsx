"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ListChecks, MessageSquare, RefreshCw, Ticket, UserRoundX } from "lucide-react";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityIndicator, StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTable, Td, Th } from "@/components/ui/data-table";
import { ActivityRow } from "@/components/workspace/activity-row";
import { AttentionStrip, type AttentionItem } from "@/components/workspace/attention-strip";
import { AnimarNoScroll } from "@/components/animar-no-scroll";
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
    priority?: string;
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

function clock(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return formatAge(iso) ?? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function ageLabel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  const then = new Date(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return "ontem";
  return `há ${days}d`;
}

function SectionLabel({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      <span className={cn("size-1.5", dot)} aria-hidden />
      {children}
    </h2>
  );
}

export default function DashboardPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/api/dashboard"),
  });
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
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
  const openCount = data?.abertos ?? 0;

  const attention: AttentionItem[] = [];
  if (data) {
    if ((data.prazosVencidos ?? 0) > 0) {
      attention.push({
        href: "/prazos?overdue=1",
        label: "Prazos vencidos",
        detail: "A data interna passou e o prazo não foi concluído.",
        verb: "Resolver",
        value: data.prazosVencidos ?? 0,
        tone: "danger",
      });
    }
    if ((data.prazosProximos ?? 0) > 0) {
      attention.push({
        href: "/prazos?dueSoon=1",
        label: "Prazos próximos",
        detail: "Vencem nas próximas 72 horas.",
        verb: "Ver prazos",
        value: data.prazosProximos ?? 0,
        tone: "danger",
      });
    }
    if ((data.rascunhos ?? 0) > 0) {
      attention.push({
        href: "/atendimento",
        label: "Rascunhos pendentes de aprovação",
        detail: "Mensagem pública aguardando aprovação do admin.",
        verb: "Revisar",
        value: data.rascunhos ?? 0,
        tone: "warn",
      });
    }
    if (data.enviosFalhos > 0) {
      attention.push({
        href: employee ? "/atendimento" : "/conexoes",
        label: "Envios falhos",
        detail: "O WhatsApp recusou ou a sessão estava fechada.",
        verb: "Revisar",
        value: data.enviosFalhos,
        tone: "warn",
      });
    }
    if (!employee && (data.semResponsavel ?? 0) > 0) {
      attention.push({
        href: "/chamados?unassigned=1",
        label: "Sem responsável",
        detail: "Chamado parado sem dono.",
        verb: "Atribuir",
        value: data.semResponsavel ?? 0,
        tone: "warn",
      });
    }
    if ((data.emAndamento ?? 0) > 0) {
      attention.push({
        href: "/chamados",
        label: "Em andamento",
        detail: "Trabalho em curso.",
        verb: "Seguir",
        value: data.emAndamento ?? 0,
        tone: "info",
      });
    }
    if ((data.aguardando ?? 0) > 0) {
      attention.push({
        href: "/chamados",
        label: "Aguardando",
        detail: "Esperando cliente, documento ou retorno.",
        verb: "Ver chamados",
        value: data.aguardando ?? 0,
        tone: "neutral",
      });
    }
  }

  const tickets = data?.meusChamadosLista ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Visão geral</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>O que precisa de ação agora</span>
            {today ? (
              <>
                <span className="inline-block size-1 rounded-full bg-[#c2c7cc]" aria-hidden />
                <span className="capitalize">{today}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {wa ? (
            <p
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide",
                wa.tone === "ok"
                  ? "border-[#bfdbfe] bg-[var(--status-aberto-bg)] text-foreground"
                  : "border-border bg-secondary text-muted-foreground",
              )}
              aria-label={`WhatsApp ${wa.label}`}
            >
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  wa.tone === "ok" ? "bg-[var(--ok)]" : wa.tone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground",
                )}
              />
              {wa.tone === "ok" ? "CONECTADO → WA" : wa.label.toUpperCase()}
            </p>
          ) : null}
          <button
            type="button"
            className="inline-flex h-[36px] items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-[var(--brand-soft)]"
            onClick={() => q.refetch()}
          >
            <RefreshCw className="size-4" />
            Atualizar
          </button>
        </div>
      </header>

      {q.isLoading || !data ? (
        <div className="grid gap-3.5 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            <AnimarNoScroll animacao="surgir-de-baixo">
              <section aria-label="Fila de ação">
                <div className="mb-2.5">
                  <SectionLabel dot="rounded-sm bg-primary">Agora · Fila operacional</SectionLabel>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label="Não vinculados"
                    value={unlinked}
                    hint="Mensagens fora do fluxo"
                    verb="Vincular"
                    icon={UserRoundX}
                    chip="Fora do fluxo"
                    chipClassName="bg-amber-50 text-amber-700"
                    href={employee ? undefined : "/nao-vinculados"}
                  />
                  <MetricCard
                    label="Triagem"
                    value={data.triagem}
                    hint="Aguardando classificação"
                    verb="Analisar"
                    icon={ListChecks}
                    chip="Classificação"
                    chipClassName="bg-slate-100 text-slate-600"
                    href={employee ? undefined : "/triagem"}
                  />
                  <MetricCard
                    label="Não lidas"
                    value={data.naoLidas ?? 0}
                    hint="Mensagens de clientes no fluxo"
                    verb="Atender"
                    icon={MessageSquare}
                    chip="Fila de espera"
                    chipClassName="bg-blue-50 text-blue-700"
                    href="/atendimento"
                  />
                  <MetricCard
                    label="Abertos"
                    value={openCount}
                    hint={employee ? "Abertos sob sua responsabilidade" : "Chamados ainda não em andamento"}
                    verb="Operar"
                    icon={Ticket}
                    chip="Chamados ativos"
                    chipClassName="bg-[var(--status-aberto-bg)] text-[var(--status-aberto)]"
                    href="/chamados"
                  />
                </div>
              </section>
            </AnimarNoScroll>

            <div className="grid items-start gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <AnimarNoScroll animacao="surgir-de-baixo" atraso={0.1}>
                  <AttentionStrip items={attention} />
                </AnimarNoScroll>
              </div>

              <section aria-label="Minha operação" className="space-y-3 lg:col-span-7">
                <AnimarNoScroll animacao="deslizar-direita" atraso={0.2}>
                  <div className="flex items-center justify-between">
                    <SectionLabel dot="rounded-sm bg-primary">Minha operação · Chamados atribuídos</SectionLabel>
                    <Link href="/chamados" className="text-xs font-medium text-primary">
                      Chamados →
                    </Link>
                  </div>
                  <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow duration-300">
                    {tickets.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted-foreground">Nenhum chamado em aberto.</p>
                    ) : (
                      <>
                        <ul className="md:hidden">
                          {tickets.map((t) => (
                            <li key={t.id} className="border-b border-border last:border-b-0">
                              <Link href={`/chamados/${t.id}`} className="block px-4 py-3 text-sm hover:bg-slate-50 transition-colors">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="font-mono font-semibold tabular">#{t.protocol}</span>
                                  <StatusBadge status={t.status} />
                                </span>
                                <span className="mt-1 block font-medium">{t.contact?.nome || "Sem contato"}</span>
                                <span className="block text-xs text-muted-foreground">{t.condominium.nome}</span>
                                <span className="mt-1 flex items-center justify-between gap-2">
                                  {t.priority ? <PriorityIndicator priority={t.priority} /> : <span />}
                                  <time className="text-xs text-muted-foreground tabular">{ageLabel(t.updatedAt)}</time>
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                        <div className="hidden md:block">
                          <DataTable className="border-t-0">
                            <thead>
                              <tr>
                                <Th>Protocolo</Th>
                                <Th>Contato / entidade</Th>
                                <Th>Status</Th>
                                <Th>Prioridade</Th>
                                <Th className="text-right">Idade</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {tickets.map((t) => (
                                <tr key={t.id} className="transition-colors hover:bg-slate-50/50">
                                  <Td>
                                    <Link href={`/chamados/${t.id}`} className="font-mono font-semibold text-foreground tabular hover:text-primary transition-colors">
                                      #{t.protocol}
                                    </Link>
                                  </Td>
                                  <Td>
                                    <span className="block font-medium leading-tight">{t.contact?.nome || "Sem contato"}</span>
                                    <span className="block text-[11px] text-muted-foreground">{t.condominium.nome}</span>
                                  </Td>
                                  <Td>
                                    <StatusBadge status={t.status} />
                                  </Td>
                                  <Td>{t.priority ? <PriorityIndicator priority={t.priority} /> : "—"}</Td>
                                  <Td className="text-right font-mono text-xs text-muted-foreground">{ageLabel(t.updatedAt)}</Td>
                                </tr>
                              ))}
                            </tbody>
                          </DataTable>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between border-t border-border bg-slate-50 px-4 py-2 text-xs text-muted-foreground">
                      <span>
                        {tickets.length} chamado{tickets.length === 1 ? "" : "s"} em aberto nesta lista
                        {typeof data.meusChamados === "number" ? ` · ${data.meusChamados} sob sua responsabilidade` : ""}
                      </span>
                      <Link href="/chamados" className="font-semibold text-primary hover:underline">
                        Ver grade completa →
                      </Link>
                    </div>
                  </div>
                </AnimarNoScroll>
              </section>
            </div>

            <AnimarNoScroll animacao="surgir-de-baixo" atraso={0.3}>
              <section aria-label="Atividade" className="space-y-2.5 pb-4">
                <div className="flex items-center justify-between">
                  <SectionLabel dot="rounded-sm bg-muted-foreground">Atividade recente</SectionLabel>
                  <Link href="/atendimento" className="text-xs font-medium text-primary hover:underline">
                    Inbox →
                  </Link>
                </div>
                <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow duration-300">
                  {data.recent.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-muted-foreground">Nenhuma conversa recente.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {data.recent.map((row) => (
                        <li key={row.id} className="transition-colors hover:bg-slate-50/50">
                          <ActivityRow
                            variant="log"
                            href="/atendimento"
                            when={clock(row.updatedAt)}
                            icon={<MessageSquare className="size-3.5" />}
                            primary={row.contact?.nome || "Conversa"}
                            secondary={row.condominium?.nome || undefined}
                            trailing="Atendimento"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </AnimarNoScroll>
          </div>
        )}
      </div>
    );
  }
