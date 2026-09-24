"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner, ForbiddenState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { WorkspacePane, WorkspaceShell } from "@/components/workspace/workspace-shell";
import { TriageAnalysisPanel } from "@/components/triagem/triage-analysis-panel";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
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
    peerDisplayName?: string | null;
    peerAvatarUrl?: string | null;
    contact: { nome: string; phoneE164: string } | null;
    condominium: { nome: string } | null;
    messages: { body: string; createdAt: string }[];
  };
};

export default function TriagemPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "analysis">("list");
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
    return (
      <div className="p-4">
        <ErrorBanner message="Falha ao carregar triagem." onRetry={() => list.refetch()} />
      </div>
    );
  }

  const items = filtered;
  const currentId = selected || items[0]?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Triagem</h1>
          <p className="text-xs text-muted-foreground">
            <span className="tabular font-medium text-foreground">{list.data?.meta?.total ?? items.length}</span>{" "}
            aguardando classificação
          </p>
        </div>
        <Input
          className="ml-auto h-8 max-w-xs"
          placeholder="Buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar triagem"
        />
      </div>
      {list.isLoading ? (
        <div className="space-y-2 p-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Tudo limpo" hint="Nada na triagem." />
      ) : (
        <WorkspaceShell cols="triage">
          <WorkspacePane className={cn(mobilePane !== "list" && "hidden lg:flex")}>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-background p-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-[var(--radius)] border border-border border-l-2 bg-card px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)]",
                      currentId === item.id
                        ? "border-l-primary bg-[color-mix(in_srgb,var(--brand)_6%,white)]"
                        : "border-l-transparent hover:border-[var(--border-strong)]",
                    )}
                    onClick={() => {
                      setSelected(item.id);
                      setMobilePane("analysis");
                      router.replace(`/triagem?id=${item.id}`, { scroll: false });
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <PeerAvatar
                        name={item.conversation.contact?.nome || item.conversation.peerDisplayName || "Contato"}
                        avatarUrl={item.conversation.peerAvatarUrl}
                        className="mt-0.5 size-7"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.conversation.contact?.nome || "Contato"}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {item.conversation.messages[0]?.body || "—"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {item.conversation.condominium?.nome || "—"} · {formatWhen(item.updatedAt)}
                        </p>
                        {(item.conversation.peerPhoneE164 || item.conversation.contact?.phoneE164) && (
                          <p className="text-[11px] text-muted-foreground">
                            {conversationPhoneLabel(
                              item.conversation.contact?.phoneE164,
                              item.conversation.peerPhoneE164,
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </WorkspacePane>
          <WorkspacePane className={cn(mobilePane !== "analysis" && "hidden lg:flex")}>
            <div className="flex shrink-0 items-center border-b border-border px-3 py-2 lg:hidden">
              <button type="button" className="text-sm text-[var(--brand)]" onClick={() => setMobilePane("list")}>
                ← Solicitações
              </button>
            </div>
            {currentId ? (
              <TriageAnalysisPanel
                key={currentId}
                id={currentId}
                showThread
                onDone={() => {
                  setSelected(null);
                  setMobilePane("list");
                }}
              />
            ) : (
              <EmptyState title="Selecione uma solicitação" />
            )}
          </WorkspacePane>
        </WorkspaceShell>
      )}
    </div>
  );
}
