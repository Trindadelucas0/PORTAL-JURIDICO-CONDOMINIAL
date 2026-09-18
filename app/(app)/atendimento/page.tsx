"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar } from "@/components/ui/toolbar";
import { Accordion } from "@/components/ui/accordion";
import { ThreadPanel, type ThreadConversation } from "@/components/atendimento/thread-panel";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { conversationPhoneLabel } from "@/lib/phone/display";
import { STATUS_LABEL, initials } from "@/lib/ui-labels";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";

type Conversation = ThreadConversation & {
  unread?: boolean;
  updatedAt: string;
  triageItem: { id: string; status: string } | null;
  tickets?: { id: string; protocol: string; status: string }[];
  messages: { body: string }[];
};

type Filter = "all" | "unread" | "triage";

function InboxInner() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState<Filter>("all");
  const [mobilePane, setMobilePane] = useState<"list" | "thread" | "context">("list");
  const [contextOpen, setContextOpen] = useState(true);
  const list = useQuery({
    queryKey: ["conversations", q, filter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (filter === "unread") p.set("unread", "1");
      if (filter === "triage") p.set("untreated", "1");
      return api<Conversation[]>(`/api/conversations?${p.toString()}`);
    },
  });
  const items = list.data?.data ?? [];
  const current = items.find((c) => c.id === selected) || items[0];
  const currentId = selected || current?.id;

  if (list.isError) {
    return <ErrorBanner message="Não foi possível carregar conversas." onRetry={() => list.refetch()} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader title="Atendimento" description="Conversas do fluxo (contato com condomínio)" />
      <Toolbar>
        <FilterBar>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            Todas
          </FilterChip>
          <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")}>
            Não lidas
          </FilterChip>
          <FilterChip active={filter === "triage"} onClick={() => setFilter("triage")}>
            Triagem
          </FilterChip>
        </FilterBar>
      </Toolbar>
      <div
        className={cn(
          "mt-1 grid min-h-0 flex-1 gap-4 overflow-hidden",
          contextOpen ? "xl:grid-cols-[260px_minmax(0,1fr)_260px]" : "xl:grid-cols-[260px_minmax(0,1fr)]",
          "lg:grid-cols-[260px_minmax(0,1fr)]",
        )}
      >
        <Frame className={cn(mobilePane !== "list" && "hidden lg:block")}>
        <FramePanel>
        <aside className="p-3">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conversas" />
          {list.isLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="Nenhuma conversa" hint="Cadastre o contato no condomínio. Números avulsos ficam em Não vinculados." />
          ) : (
            <ul className="mt-3 space-y-1">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm",
                      currentId === c.id ? "bg-muted" : "hover:bg-muted/70",
                    )}
                    onClick={() => {
                      setSelected(c.id);
                      setMobilePane("thread");
                    }}
                  >
                    <Avatar className="mt-0.5 size-8">
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                        {initials(c.contact?.nome || "C")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        {c.unread ? <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Não lida" /> : null}
                        <span className="truncate">{c.contact?.nome || "Contato"}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.messages[0]?.body || "—"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        </FramePanel>
        </Frame>
        <Frame className={cn(mobilePane !== "thread" && "hidden lg:block min-w-0")}>
        <FramePanel className="min-h-0">
        <ThreadPanel
          conversation={current}
          hidden={mobilePane !== "thread"}
          onBack={() => setMobilePane("list")}
          onContext={() => setMobilePane("context")}
          title={current?.contact?.nome || "Contato"}
          subtitle={
            current
              ? `${current.condominium?.nome || "sem condomínio"} · ${current.connection.label}`
              : undefined
          }
          allowPublicSend={Boolean(current && current.connection.status === "open")}
          publicBlockedHint={
            current && current.connection.status !== "open" ? "WhatsApp não está conectado." : null
          }
        />
        </FramePanel>
        </Frame>
        <Frame className={cn(mobilePane !== "context" && "hidden xl:block")}>
        <FramePanel>
        <ContextPane
          conversation={current}
          collapsed={!contextOpen}
          onToggle={() => setContextOpen((v) => !v)}
          hidden={mobilePane !== "context"}
          onBack={() => setMobilePane("thread")}
        />
        </FramePanel>
        </Frame>
      </div>
    </div>
  );
}

function ContextPane({
  conversation,
  collapsed,
  onToggle,
  hidden,
  onBack,
}: {
  conversation?: Conversation;
  collapsed: boolean;
  onToggle: () => void;
  hidden: boolean;
  onBack: () => void;
}) {
  return (
        <aside className={cn("p-4 text-sm", collapsed ? "xl:hidden" : "xl:block", hidden ? "hidden" : "block")}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="text-[var(--brand)] xl:hidden" onClick={onBack}>
          ← Conversa
        </button>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Contexto</h2>
        <button type="button" className="hidden text-[var(--muted)] xl:inline" onClick={onToggle} aria-label="Recolher contexto">
          −
        </button>
      </div>
      {!conversation ? (
        <p className="text-[var(--muted)]">Selecione uma conversa.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[var(--muted)]">Contato</p>
            <p>{conversation.contact?.nome}</p>
            <p className="text-[var(--muted)]">
              {conversationPhoneLabel(conversation.contact?.phoneE164, conversation.peerPhoneE164)}
            </p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Condomínio</p>
            <p>{conversation.condominium?.nome || "—"}</p>
          </div>
          <Accordion title="Mais informações" defaultOpen>
            <div className="space-y-3">
              <div>
                <p className="text-[var(--muted)]">Triagem</p>
                <p>{conversation.triageItem ? STATUS_LABEL[conversation.triageItem.status] || conversation.triageItem.status : "—"}</p>
                {conversation.triageItem?.status === "aberto" ? (
                  <Link className="text-[var(--brand)]" href={`/triagem/${conversation.triageItem.id}`}>
                    Analisar
                  </Link>
                ) : null}
              </div>
              <div>
                <p className="text-[var(--muted)]">Chamados</p>
                {conversation.tickets?.length ? (
                  conversation.tickets.map((t) => (
                    <Link key={t.id} className="block text-[var(--brand)]" href={`/chamados/${t.id}`}>
                      #{t.protocol}
                    </Link>
                  ))
                ) : (
                  <p>Nenhum</p>
                )}
              </div>
            </div>
          </Accordion>
        </div>
      )}
    </aside>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <InboxInner />
    </Suspense>
  );
}
