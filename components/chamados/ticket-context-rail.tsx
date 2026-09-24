"use client";

import Link from "next/link";
import { PeerAvatar } from "@/components/atendimento/peer-avatar";
import { ContextBlock, ContextSummary } from "@/components/workspace/context-summary";
import { formatDue, isOverdue } from "@/lib/ui-labels";
import { formatWhatsAppPeer } from "@/lib/phone/display";
import { peerAvatarPublicUrl } from "@/lib/phone/avatar-url";

export type ContextRailTicket = {
  condominium: { id: string; nome: string };
  contact: { nome: string; phoneE164: string; avatarKey?: string | null };
  assignedTo: { nome?: string; email: string } | null;
  conversation: {
    connection: { label: string };
    peerAvatarKey?: string | null;
  } | null;
  nextOpenDeadline?: { title: string; dueAt: string; doneAt: string | null } | null;
};

export function TicketContextContent({ ticket }: { ticket: ContextRailTicket }) {
  return (
    <div className="space-y-4">
      <ContextBlock label="Condomínio">
        <Link className="text-[var(--brand)]" href={`/condominios/${ticket.condominium.id}`}>
          {ticket.condominium.nome}
        </Link>
      </ContextBlock>
      <ContextBlock label="Contato">
        <span className="flex items-center gap-2">
          <PeerAvatar
            name={ticket.contact.nome}
            avatarUrl={
              peerAvatarPublicUrl(ticket.contact.avatarKey) ||
              peerAvatarPublicUrl(ticket.conversation?.peerAvatarKey)
            }
            className="size-7"
          />
          <span>
            {ticket.contact.nome}
            <span className="block text-xs text-muted-foreground">
              {formatWhatsAppPeer(ticket.contact.phoneE164)}
            </span>
          </span>
        </span>
      </ContextBlock>
      <ContextBlock label="Responsável">
        {ticket.assignedTo?.nome || ticket.assignedTo?.email || "—"}
      </ContextBlock>
      {ticket.nextOpenDeadline ? (
        <ContextBlock label="Próximo prazo">
          <span
            className={
              isOverdue(ticket.nextOpenDeadline.dueAt, ticket.nextOpenDeadline.doneAt)
                ? "text-[var(--danger)]"
                : undefined
            }
          >
            {ticket.nextOpenDeadline.title} · {formatDue(ticket.nextOpenDeadline.dueAt)}
          </span>
        </ContextBlock>
      ) : null}
      {ticket.conversation ? (
        <ContextBlock label="Origem">{ticket.conversation.connection.label}</ContextBlock>
      ) : null}
    </div>
  );
}

export function TicketContextRail({
  ticket,
  className,
}: {
  ticket: ContextRailTicket;
  className?: string;
}) {
  return (
    <ContextSummary title="Contexto" className={className}>
      <TicketContextContent ticket={ticket} />
    </ContextSummary>
  );
}
