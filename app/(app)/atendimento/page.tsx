"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-bar";
import { ThreadPanel, type ThreadConversation } from "@/components/atendimento/thread-panel";
import { WorkspacePane, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { api } from "@/lib/client/api";
import { livePollQuery } from "@/lib/client/live-poll";
import { cn } from "@/lib/utils";
import { conversationIdentityLabel, conversationPhoneLabel } from "@/lib/phone/display";
import { ExpandableRow } from "@/components/ui/expandable-row";
import { ContextBlock, ContextSummary } from "@/components/workspace/context-summary";
import { formatAge, STATUS_LABEL } from "@/lib/ui-labels";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import Link from "next/link";

type Conversation = ThreadConversation & {
  unread?: boolean;
  updatedAt: string;
  peerAvatarUrl?: string | null;
  peerDisplayName?: string | null;
  triageItem: { id: string; status: string } | null;
  tickets?: { id: string; protocol: string; status: string }[];
  messages: { body: string }[];
};

type Filter = "all" | "unread" | "triage";

function useNotebookCollapseDefault() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1439px)");
    const apply = () => setOpen(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return [open, setOpen] as const;
}

function InboxInner() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState<Filter>("all");
  const [mobilePane, setMobilePane] = useState<"list" | "thread" | "context">("list");
  const [contextOpen, setContextOpen] = useNotebookCollapseDefault();
  const list = useQuery({
    queryKey: ["conversations", q, filter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (filter === "unread") p.set("unread", "1");
      if (filter === "triage") p.set("untreated", "1");
      return api<Conversation[]>(`/api/conversations?${p.toString()}`);
    },
    ...livePollQuery,
  });
  const items = list.data?.data ?? [];
  const current = items.find((c) => c.id === selected) || items[0];
  const currentId = selected || current?.id;

  if (list.isError) {
    return (
      <div className="p-4">
        <ErrorBanner message="Não foi possível carregar conversas." onRetry={() => list.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col lg:h-[calc(100dvh-3rem)]">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <h1 className="text-sm font-semibold">Atendimento</h1>
        <FilterBar className="ml-auto sm:ml-0">
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
      </div>
      <WorkspaceShell cols="inbox" contextOpen={contextOpen}>
        <WorkspacePane
          className={cn(mobilePane !== "list" && "hidden lg:flex")}
          hidden={false}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <Input
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar conversas"
              className="h-8"
            />
            {list.isLoading ? (
              <div className="mt-2 space-y-1">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState title="Tudo limpo" hint="Nenhuma conversa no fluxo." />
            ) : (
              <ul className="mt-1">
                {items.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 border-l-2 px-2 py-2 text-left text-sm transition-colors duration-[var(--motion-fast)]",
                        currentId === c.id
                          ? "border-l-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,white)]"
                          : "border-l-transparent hover:bg-muted/50",
                      )}
                      onClick={() => {
                        setSelected(c.id);
                        setMobilePane("thread");
                      }}
                    >
                      <PeerAvatar
                        className="mt-0.5 size-7"
                        name={c.contact?.nome || c.peerDisplayName || "Contato"}
                        avatarUrl={c.peerAvatarUrl}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {c.unread ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Não lida" />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {c.contact?.nome || c.peerDisplayName || conversationIdentityLabel(c)}
                          </span>
                          <span className="shrink-0 tabular text-[11px] text-muted-foreground">
                            {formatAge(c.updatedAt) ?? ""}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {c.messages[0]?.body || "—"}
                        </span>
                        {c.triageItem?.status === "aberto" ? (
                          <span className="mt-0.5 inline-block text-[10px] font-medium tracking-wide text-[var(--warn)] uppercase">
                            Triagem
                          </span>
                        ) : c.tickets?.[0] ? (
                          <span className="mt-0.5 inline-block text-[10px] font-medium tabular text-muted-foreground">
                            #{c.tickets[0].protocol}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </WorkspacePane>
        <WorkspacePane className={cn("min-w-0", mobilePane !== "thread" && "hidden lg:flex")}>
          <ThreadPanel
            conversation={current}
            hidden={mobilePane !== "thread"}
            onBack={() => setMobilePane("list")}
            onContext={() => {
              setContextOpen(true);
              setMobilePane("context");
            }}
            title={
              current
                ? current.contact?.nome || current.peerDisplayName || conversationIdentityLabel(current)
                : "Contato"
            }
            subtitle={
              current
                ? `${conversationPhoneLabel(current.contact?.phoneE164, current.peerPhoneE164)} · ${current.condominium?.nome || "sem condomínio"} · ${current.connection.label}`
                : undefined
            }
            allowPublicSend={Boolean(current && current.connection.status === "open")}
            publicBlockedHint={
              current && current.connection.status !== "open" ? "WhatsApp não está conectado." : null
            }
          />
        </WorkspacePane>
        <WorkspacePane
          className={cn(
            !contextOpen && "xl:hidden",
            mobilePane !== "context" && "hidden xl:flex",
          )}
        >
          <ContextPane
            conversation={current}
            onToggle={() => setContextOpen((v) => !v)}
            hidden={mobilePane !== "context"}
            onBack={() => setMobilePane("thread")}
          />
        </WorkspacePane>
      </WorkspaceShell>
    </div>
  );
}

function ContextPane({
  conversation,
  onToggle,
  hidden,
  onBack,
}: {
  conversation?: Conversation;
  onToggle: () => void;
  hidden: boolean;
  onBack: () => void;
}) {
  return (
    <ContextSummary hidden={hidden} onBack={onBack} onCollapse={onToggle}>
      {!conversation ? (
        <p className="text-muted-foreground">Selecione uma conversa.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <PeerAvatar
              name={conversation.contact?.nome || conversation.peerDisplayName || "Contato"}
              avatarUrl={conversation.peerAvatarUrl}
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Contato</p>
              <p className="font-medium">
                {conversation.contact?.nome || conversation.peerDisplayName || "Contato"}
              </p>
              <p className="text-xs text-muted-foreground">
                {conversationPhoneLabel(conversation.contact?.phoneE164, conversation.peerPhoneE164)}
              </p>
            </div>
          </div>
          <ContextBlock label="Condomínio">
            {conversation.condominium?.nome ? (
              <Link href="/condominios" className="text-[var(--brand)]">
                {conversation.condominium.nome}
              </Link>
            ) : (
              <p>—</p>
            )}
          </ContextBlock>
          <ContextBlock label="Chamado">
            {conversation.tickets?.length ? (
              conversation.tickets.map((t) => (
                <Link key={t.id} className="block text-[var(--brand)]" href={`/chamados/${t.id}`}>
                  #{t.protocol} · {STATUS_LABEL[t.status] || t.status}
                </Link>
              ))
            ) : (
              <p>Nenhum chamado ainda</p>
            )}
          </ContextBlock>
          <ContextBlock label="Triagem">
            {conversation.triageItem ? (
              <p>
                {STATUS_LABEL[conversation.triageItem.status] || conversation.triageItem.status}
                {conversation.triageItem.status === "aberto" ? (
                  <>
                    {" · "}
                    <Link className="text-[var(--brand)]" href={`/triagem/${conversation.triageItem.id}`}>
                      Analisar
                    </Link>
                  </>
                ) : null}
              </p>
            ) : (
              <p>—</p>
            )}
          </ContextBlock>
          <ExpandableRow title="Mais informações" summary="Histórico e documentos no chamado">
            <p className="text-xs text-muted-foreground">
              Documentos e prazos ficam na ficha do chamado. Origem: {conversation.connection.label}.
            </p>
          </ExpandableRow>
        </div>
      )}
    </ContextSummary>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <InboxInner />
    </Suspense>
  );
}
