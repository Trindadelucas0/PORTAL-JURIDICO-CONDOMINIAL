"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar } from "@/components/ui/toolbar";
import { DataTable, Td, Th } from "@/components/ui/data-table";
import { api } from "@/lib/client/api";
import { conversationPhoneLabel } from "@/lib/phone/display";
import { formatWhen } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  status: string;
  updatedAt: string;
  conversationId?: string;
  conversation: {
    peerPhoneE164?: string;
    contact: { nome: string; phoneE164: string } | null;
    condominium: { nome: string } | null;
    messages: { body: string; createdAt: string }[];
  };
};

export default function TriagemPage() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["triage"],
    queryFn: () => api<Item[]>("/api/triage"),
  });

  const filtered = useMemo(() => {
    const items = list.data?.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) => {
      const name = item.conversation.contact?.nome || "";
      const phone = item.conversation.contact?.phoneE164 || item.conversation.peerPhoneE164 || "";
      const condo = item.conversation.condominium?.nome || "";
      const body = item.conversation.messages[0]?.body || "";
      return `${name} ${phone} ${condo} ${body}`.toLowerCase().includes(s);
    });
  }, [list.data, q]);

  if (list.isError) {
    const errStatus = (list.error as Error & { status?: number }).status;
    if (errStatus === 403) return <ForbiddenState />;
    return <ErrorBanner message="Falha ao carregar triagem." onRetry={() => list.refetch()} />;
  }

  const items = list.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Triagem"
        description="Demandas de contatos já cadastrados no condomínio. Classifique e promova a chamado."
        action={
          <p className="text-sm text-muted-foreground">
            <span className="tabular font-medium text-[var(--ink)]">{list.data?.meta?.total ?? items.length}</span> aguardando
          </p>
        }
      />
      <Toolbar>
        <Input placeholder="Buscar solicitação…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar triagem" />
      </Toolbar>
      {list.isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nada na triagem"
          hint="Só entram números cadastrados no condomínio. Avulsos ficam em Não vinculados."
        />
      ) : (
        <DataTable className="mt-4">
          <thead>
            <tr>
              <Th>Solicitação</Th>
              <Th>Condomínio</Th>
              <Th>Quando</Th>
              <Th><span className="sr-only">Ação</span></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <Td>
                  <p className="font-medium">{item.conversation.contact?.nome || "Contato"}</p>
                  <p className="mt-1 line-clamp-2 rounded-md bg-muted px-2 py-1.5 text-sm">“{item.conversation.messages[0]?.body || "—"}”</p>
                  {item.conversation.peerPhoneE164 || item.conversation.contact?.phoneE164 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {conversationPhoneLabel(item.conversation.contact?.phoneE164, item.conversation.peerPhoneE164)}
                    </p>
                  ) : null}
                </Td>
                <Td>{item.conversation.condominium?.nome || "—"}</Td>
                <Td>{formatWhen(item.updatedAt)}</Td>
                <Td>
                  <Link href={`/triagem/${item.id}`} className={cn(buttonVariants(), "shrink-0")}>
                    Analisar
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
