"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/client/api";
import { formatWhen } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  status: string;
  updatedAt: string;
  conversationId?: string;
  conversation: {
    unidentified: boolean;
    peerPhoneE164?: string;
    contact: { nome: string; phoneE164: string; condominiumId?: string | null } | null;
    condominium: { nome: string } | null;
    messages: { body: string; createdAt: string }[];
  };
};

export default function TriagemPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unidentified">("all");
  const list = useQuery({
    queryKey: ["triage", filter],
    queryFn: () => api<Item[]>(filter === "unidentified" ? "/api/triage?unidentified=1" : "/api/triage"),
  });

  const filtered = useMemo(() => {
    const items = list.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) => {
      const name = item.conversation.contact?.nome || "";
      const phone = item.conversation.contact?.phoneE164 || item.conversation.peerPhoneE164 || "";
      const body = item.conversation.messages[0]?.body || "";
      return `${name} ${phone} ${body}`.toLowerCase().includes(s);
    });
  }, [list.data, q]);

  if (list.isError) {
    const errStatus = (list.error as Error & { status?: number }).status;
    if (errStatus === 403) return <ForbiddenState />;
    return <ErrorBanner message="Falha ao carregar triagem." onRetry={() => list.refetch()} />;
  }

  const items = list.data?.data ?? [];
  const unidentCount = items.filter((i) => i.conversation.unidentified).length;

  return (
    <div>
      <PageHeader
        title="Triagem"
        description="Analise as novas solicitações antes de criar um chamado"
        action={
          <p className="text-sm text-[var(--muted)]">
            <span className="tabular font-medium text-[var(--ink)]">{list.data?.meta?.total ?? items.length}</span> aguardando
          </p>
        }
      />
      <FilterBar>
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={list.data?.meta?.total}>
          Todas
        </FilterChip>
        <FilterChip active={filter === "unidentified"} onClick={() => setFilter("unidentified")} count={unidentCount}>
          Não identificadas
        </FilterChip>
      </FilterBar>
      <div className="mt-4">
        <Input placeholder="Buscar solicitação…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar triagem" />
      </div>
      {list.isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nada na triagem" hint="Inbounds abrem um item aqui. Chamado só após promover." />
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)]">
          {filtered.map((item) => {
            const unidentified = item.conversation.unidentified;
            return (
              <li key={item.id} className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {unidentified ? "Não identificado" : item.conversation.contact?.nome || "Contato"}
                    <span className="ml-2 text-sm font-normal text-[var(--muted)]">{formatWhen(item.updatedAt)}</span>
                  </p>
                  {item.conversation.condominium?.nome ? (
                    <p className="text-sm text-[var(--muted)]">{item.conversation.condominium.nome}</p>
                  ) : null}
                  <p className="mt-1 line-clamp-2 text-sm">“{item.conversation.messages[0]?.body || "—"}”</p>
                  {(item.conversation.peerPhoneE164 || item.conversation.contact?.phoneE164) ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {item.conversation.contact?.phoneE164 || item.conversation.peerPhoneE164}
                    </p>
                  ) : null}
                </div>
                <Link href={`/triagem/${item.id}`} className={cn(buttonVariants(), "shrink-0")}>
                  Analisar
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
