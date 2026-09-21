"use client";

import { Button } from "@/components/ui/button";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { conversationIdentityLabel, conversationPhoneLabel } from "@/lib/phone/display";

export function UnlinkedIdentityPanel({
  conversation,
  onBack,
  onEnroll,
}: {
  conversation?: {
    contact?: { nome?: string | null; phoneE164?: string | null } | null;
    peerDisplayName?: string | null;
    peerPhoneE164?: string | null;
    peerAvatarUrl?: string | null;
    condominium?: { nome: string } | null;
    connection: { label: string };
  } | null;
  onBack: () => void;
  onEnroll: () => void;
}) {
  const title = conversation ? conversationIdentityLabel(conversation) : null;
  const phone = conversation
    ? conversationPhoneLabel(conversation.contact?.phoneE164, conversation.peerPhoneE164)
    : null;

  return (
    <aside className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" className="text-[var(--brand)] xl:hidden" onClick={onBack}>
          ← Conversa
        </button>
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Identidade
        </h2>
      </div>
      {!conversation ? (
        <p className="text-muted-foreground">Selecione uma mensagem na fila.</p>
      ) : (
        <div className="space-y-4">
          <ol className="space-y-1 text-xs text-muted-foreground">
            <li>1. Mensagem recebida</li>
            <li className="font-medium text-foreground">2. Identificar quem é</li>
            <li>3. Vincular ao fluxo (abre triagem, não chamado)</li>
          </ol>
          <div className="flex items-center gap-3">
            <PeerAvatar name={title} avatarUrl={conversation.peerAvatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Contato</p>
              <p className="font-medium">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{phone}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Origem</p>
            <p>{conversation.connection.label}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Condomínio</p>
            <p>{conversation.condominium?.nome || "Não identificado"}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Sem triagem e sem chamado até vincular. A conversa continua só como evidência.
          </p>
          <Button type="button" className="w-full" onClick={onEnroll}>
            Vincular ao fluxo
          </Button>
        </div>
      )}
    </aside>
  );
}
