import { formatWhen } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export type MessageBubbleItem = {
  id: string;
  body: string;
  direction: "in" | "out";
  visibility: "publica" | "interna";
  sendStatus?: string;
  createdAt: string;
  attachments?: Array<{ storageKey: string; mime: string; originalName: string }>;
  replyTo?: { id: string; body: string; direction: string } | null;
};

function AttachmentView({ att, outgoing }: { att: { storageKey: string; mime: string; originalName: string }; outgoing: boolean }) {
  const href = `/api/files/${att.storageKey}`;
  if (att.mime.startsWith("image/")) {
    return (
      <a href={href} className="mt-2 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={att.originalName} className="max-h-48 rounded-[8px] object-cover" />
      </a>
    );
  }
  if (att.mime.startsWith("audio/")) {
    return <audio className="mt-2 w-full" controls src={href} />;
  }
  return (
    <a href={href} className={cn("mt-2 block text-xs underline", outgoing ? "text-white" : "text-[var(--brand)]")}>
      {att.originalName}
    </a>
  );
}

export function MessageBubbles({
  messages,
  onReply,
  onResend,
  resendPending,
}: {
  messages: MessageBubbleItem[];
  onReply?: (message: MessageBubbleItem) => void;
  onResend?: (messageId: string) => void;
  resendPending?: boolean;
}) {
  return (
    <div className="space-y-2">
      {messages.map((m) => {
        const outgoing = m.direction === "out" && m.visibility !== "interna";
        return (
          <div
            key={m.id}
            className={cn(
              "max-w-[80%] rounded-[12px] px-3 py-2 text-sm",
              m.visibility === "interna"
                ? "bg-amber-50 text-[var(--warn)]"
                : outgoing
                  ? "ml-auto bg-[var(--brand)] text-white"
                  : "bg-[var(--page)]",
            )}
          >
            {m.visibility === "interna" ? <span className="mr-1 text-[10px] uppercase">nota</span> : null}
            {m.replyTo ? (
              <p className={cn("mb-1 truncate rounded-[6px] px-2 py-1 text-[11px]", outgoing ? "bg-white/15" : "bg-black/5")}>
                {m.replyTo.body}
              </p>
            ) : null}
            {m.body}
            {(m.attachments ?? []).map((att) => (
              <AttachmentView key={att.storageKey} att={att} outgoing={outgoing} />
            ))}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] opacity-70">
              <span>{formatWhen(m.createdAt)}</span>
              {outgoing && m.sendStatus === "sent" ? <span>enviado</span> : null}
              {outgoing && m.sendStatus === "failed" ? <span>falhou</span> : null}
              {outgoing && m.sendStatus === "draft" ? <span>rascunho antigo</span> : null}
              {m.visibility === "publica" && onReply ? (
                <button type="button" className="underline" onClick={() => onReply(m)}>
                  Responder
                </button>
              ) : null}
              {outgoing && (m.sendStatus === "failed" || m.sendStatus === "draft") && onResend ? (
                <button type="button" className="underline" disabled={resendPending} onClick={() => onResend(m.id)}>
                  Reenviar
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
