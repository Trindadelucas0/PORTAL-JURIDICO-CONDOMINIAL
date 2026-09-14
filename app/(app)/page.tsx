"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorBanner, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { Badge } from "@/components/ui/card";

type Dashboard = {
  triagem: number;
  naoIdent: number;
  enviosFalhos: number;
  prazosVencidos: number;
  meusChamados?: number;
  conexao: { status: string; type: string; label: string } | null;
  recent: Array<{
    id: string;
    unidentified: boolean;
    updatedAt: string;
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
    if (status === 403) {
      return (
        <div>
          <h1 className="font-display text-3xl">Dashboard</h1>
          <p className="mt-4 text-[var(--muted)]">Sem permissão para os indicadores operacionais.</p>
        </div>
      );
    }
    return <ErrorBanner message="Não foi possível carregar o dashboard." onRetry={() => q.refetch()} />;
  }

  const data = q.data?.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Dashboard</h1>
          <p className="text-sm text-[var(--muted)]">Indicadores operacionais — sem gráficos de enchimento.</p>
        </div>
        <Link href="/triagem">
          <Button>Ir à triagem</Button>
        </Link>
      </div>
      {q.isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi title="Triagem aberta" value={data.triagem} />
            <Kpi title="Não identificados" value={data.naoIdent} />
            <Kpi title="Prazos vencidos" value={data.prazosVencidos} />
            <Kpi title="Envios falhos" value={data.enviosFalhos} />
            {typeof data.meusChamados === "number" ? <Kpi title="Meus chamados" value={data.meusChamados} /> : (
              <Kpi title="Conexão" value={data.conexao?.status ?? "—"} />
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-medium">Entradas recentes</h2>
              {data.recent.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">Nenhuma conversa ainda.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--border)]">
                  {data.recent.map((row) => (
                    <li key={row.id} className="py-2 text-sm">
                      {row.unidentified
                        ? "não identificado"
                        : row.contact?.nome || row.condominium?.nome || "Conversa"}
                      <span className="ml-2 text-[var(--muted)]">
                        {new Date(row.updatedAt).toLocaleString("pt-BR")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="font-medium">Conexão</h2>
              <ul className="mt-3 space-y-2">
                {data.connections.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span>
                      {c.label}{" "}
                      {c.type === "dev_mock" ? <Badge tone="dev">DEV</Badge> : null}{" "}
                      {c.type !== "dev_mock" ? <Badge tone="wa">WhatsApp</Badge> : null}
                    </span>
                    <Badge tone={c.status === "open" ? "ok" : c.status === "connecting" ? "warn" : "muted"}>
                      {c.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <p className="text-sm text-[var(--muted)]">{title}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </Card>
  );
}
