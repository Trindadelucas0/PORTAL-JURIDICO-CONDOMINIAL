"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { conversationIdentityLabel, conversationPhoneLabel } from "@/lib/phone/display";
import { formatAge } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export type UnlinkedConversation = {
  id: string;
  unread?: boolean;
  updatedAt: string;
  unidentified: boolean;
  peerPhoneE164?: string;
  peerDisplayName?: string | null;
  peerAvatarKey?: string | null;
  peerAvatarUrl?: string | null;
  contact: { nome: string; phoneE164: string; avatarKey?: string | null } | null;
  condominium: { nome: string } | null;
  connection: { status: string; type: string; label: string };
  messages: { body: string }[];
};

export function UnlinkedQueue({
  items,
  loading,
  selectedId,
  q,
  onQuery,
  onSelect,
}: {
  items: UnlinkedConversation[];
  loading: boolean;
  selectedId?: string;
  q: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-2">
        <Input
          placeholder="Buscar…"
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Buscar número"
          className="h-8 md:hidden"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="mt-2 space-y-1">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum número fora do fluxo" hint="Mensagens de contato já cadastrado no condomínio entram na triagem." />
        ) : (
          <ul className="mt-2 space-y-1.5">
            {items.map((c) => {
              const title = conversationIdentityLabel(c);
              const phone = conversationPhoneLabel(c.contact?.phoneE164, c.peerPhoneE164);
              const preview = c.messages[0]?.body || "—";
              const age = formatAge(c.updatedAt);
              const origin = c.connection.type === "dev_mock" ? "DEV" : "WhatsApp";
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-[var(--radius)] border border-border border-l-2 px-2 py-2 text-left text-sm transition-colors duration-[var(--motion-fast)]",
                      selectedId === c.id
                        ? "border-l-primary bg-[color-mix(in_srgb,var(--brand)_6%,white)]"
                        : "border-l-transparent bg-card hover:border-[var(--border-strong)]",
                    )}
                    onClick={() => onSelect(c.id)}
                  >
                    <PeerAvatar name={title} avatarUrl={c.peerAvatarUrl} className="mt-0.5 size-7" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {c.unread ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Não lida" />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
                        <span className="shrink-0 tabular text-[11px] text-muted-foreground">{age ?? ""}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {phone}
                        {c.condominium?.nome ? ` · ${c.condominium.nome}` : ""}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{preview}</span>
                      <span className="mt-0.5 inline-block text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                        {origin}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
