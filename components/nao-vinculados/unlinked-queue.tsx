"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { conversationIdentityLabel, conversationPhoneLabel, WHATSAPP_HIDDEN_NUMBER_LABEL } from "@/lib/phone/display";
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
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {loading ? (
          <div className="space-y-1 px-1">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum número fora do fluxo" hint="Mensagens de contato já cadastrado no condomínio entram na triagem." />
        ) : (
          <ul>
            {items.map((c) => {
              const title = conversationIdentityLabel(c);
              const phone = conversationPhoneLabel(c.contact?.phoneE164, c.peerPhoneE164);
              const preview = c.messages[0]?.body || "—";
              const age = formatAge(c.updatedAt);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full border-l-2 px-2 py-2 text-left transition-colors duration-[var(--motion-fast)]",
                      selectedId === c.id
                        ? "border-l-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,white)]"
                        : "border-l-transparent hover:bg-muted/50",
                    )}
                    onClick={() => onSelect(c.id)}
                  >
                    <div className="flex items-start gap-2">
                      <PeerAvatar name={title} avatarUrl={c.peerAvatarUrl} className="mt-0.5 size-7" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {c.unread ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" aria-label="Não lida" />
                            ) : null}
                            <span className="truncate text-sm font-medium">{title}</span>
                          </div>
                          {age ? <span className="shrink-0 tabular text-[11px] text-muted-foreground">{age}</span> : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{preview}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {c.connection.type === "dev_mock" ? "DEV" : "WhatsApp"}
                          {c.condominium?.nome ? (
                            <>
                              <span className="mx-1">·</span>
                              {c.condominium.nome}
                            </>
                          ) : null}
                          {title !== phone && phone !== "—" && phone !== WHATSAPP_HIDDEN_NUMBER_LABEL ? (
                            <>
                              <span className="mx-1">·</span>
                              {phone}
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
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
