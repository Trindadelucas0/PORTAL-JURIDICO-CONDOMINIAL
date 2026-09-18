"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-state";
import { ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Accordion } from "@/components/ui/accordion";
import { AlertTriangle, ListChecks, Ticket, UserRoundX } from "lucide-react";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { IconTile } from "@/components/reui/icon-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { api } from "@/lib/client/api";
import { formatWhen } from "@/lib/ui-labels";
import { humanSessionStatus } from "@/components/conexoes/whatsapp-session-card";
import { cn } from "@/lib/utils";

type Dashboard = {
  triagem: number;
  naoIdent: number;
  naoVinculados?: number;
  enviosFalhos: number;
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
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short", year: "numeric" }),
    );
  }, []);

  if (q.isError) {
    const status = (q.error as Error & { status?: number }).status;
    if (status === 403) return <ForbiddenState message="Sem permissão para os indicadores operacionais." />;
    return <ErrorBanner message="Não foi possível carregar o dashboard." onRetry={() => q.refetch()} />;
  }

  const data = q.data?.data;
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
          {data.enviosFalhos > 0 ? (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Envios falhos</AlertTitle>
              <AlertDescription>
                {data.enviosFalhos} envio(s) falhou. Confira a conexão WhatsApp e reenvie na ficha do chamado.
              </AlertDescription>
            </Alert>
          ) : null}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Atenção</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {!employee ? (
                <>
                  <Attention href="/triagem" label="Triagem" value={data.triagem} hint="aguardando análise" icon={ListChecks} />
                  <Attention href="/nao-vinculados" label="Não vinculados" value={data.naoVinculados ?? data.naoIdent} hint="fora do fluxo" icon={UserRoundX} />
                  <Attention href="/chamados" label="Sem responsável" value={data.semResponsavel ?? 0} hint="chamados abertos" icon={Ticket} />
                </>
              ) : (
                <>
                  <Attention href="/chamados" label="Meus chamados" value={data.meusChamados ?? 0} hint="em aberto" icon={Ticket} />
                  <Attention href="/chamados" label="Em andamento" value={data.emAndamento ?? 0} hint="na operação" icon={Ticket} />
                  <Attention href="/chamados" label="Aguardando" value={data.aguardando ?? 0} hint="retorno pendente" icon={Ticket} />
                </>
              )}
            </div>
          </section>
          <div className="grid gap-8 lg:grid-cols-2">
            <Frame>
              <FramePanel>
                <FrameHeader>
                  <div className="flex items-baseline justify-between gap-2">
                    <FrameTitle>Entradas recentes</FrameTitle>
                    <Link href="/atendimento" className="text-sm text-primary">
                      Ver todas
                    </Link>
                  </div>
                </FrameHeader>
                <div className="px-4 pb-4">
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recent.map((row) => (
                    <li key={row.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        {row.contact?.nome || "Conversa"}
                        {row.condominium?.nome ? (
                          <span className="text-muted-foreground"> · {row.condominium.nome}</span>
                        ) : null}
                      </span>
                      <time className="shrink-0 tabular text-muted-foreground">{formatWhen(row.updatedAt)}</time>
                    </li>
                  ))}
                </ul>
              )}
                </div>
              </FramePanel>
            </Frame>
            <Frame>
              <FramePanel>
                <FrameHeader>
                  <FrameTitle>Minha operação</FrameTitle>
                </FrameHeader>
                <div className="space-y-2 px-4 pb-4 text-sm">
                <ul className="space-y-2">
                <li>{data.abertos ?? 0} chamados abertos</li>
                <li>{data.emAndamento ?? 0} em andamento</li>
                <li>{data.enviosFalhos} envios falhos</li>
                {!employee && (data.semResponsavel ?? 0) > 0 ? <li>{data.semResponsavel} sem responsável</li> : null}
              </ul>
              <Link href="/chamados" className="mt-4 inline-block text-sm text-primary">
                Abrir minha operação
              </Link>
                </div>
              </FramePanel>
            </Frame>
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
              <div>
                Não vinculados: {data.naoVinculados ?? data.naoIdent}{" "}
                <Link href="/nao-vinculados" className="text-[var(--brand)]">
                  abrir
                </Link>
              </div>
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

function Attention({
  href,
  label,
  value,
  hint,
  icon: Icon,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  icon: typeof ListChecks;
}) {
  return (
    <Link href={href} className="block">
      <Frame>
        <FramePanel className="p-4 transition-colors hover:border-primary/30">
          <div className="flex items-start gap-3">
            <IconTile variant="soft" size="sm">
              <Icon />
            </IconTile>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-semibold tabular">{value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
            </div>
          </div>
        </FramePanel>
      </Frame>
    </Link>
  );
}
