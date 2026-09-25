import { groupMessagesByDayAndSender } from "@/lib/ui/message-groups";
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
      <a href={href} className="mt-1.5 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={att.originalName} className="max-h-44 rounded-md object-cover" />
      </a>
    );
  }
  if (att.mime.startsWith("audio/")) {
    return <audio className="mt-1.5 w-full max-w-xs" controls src={href} />;
  }
  return (
    <a href={href} className={cn("mt-1.5 block text-xs underline", outgoing ? "text-[var(--brand)]" : "text-[var(--brand)]")}>
      {att.originalName}
    </a>
  );
}

function timeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
  const days = groupMessagesByDayAndSender(messages);

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <div key={day.dayKey} className="space-y-3">
          <div className="flex items-center gap-3" role="separator" aria-label={day.label}>
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{day.label}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {day.clusters.map((cluster) => {
            if (cluster.side === "interna") {
              return (
                <div key={cluster.key} className="space-y-1.5">
                  {cluster.items.map((m) => (
                    <div
                      key={m.id}
                      className="animar-entrada w-full border-l-2 border-amber-500/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-950"
                    >
                      <span className="mr-1.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
                        Interno
                      </span>
                      <span className="whitespace-pre-wrap">{m.body}</span>
                      {(m.attachments ?? []).map((att) => (
                        <AttachmentView key={att.storageKey} att={att} outgoing={false} />
                      ))}
                      <div className="mt-1 text-[10px] text-amber-800/70">{formatWhen(m.createdAt)}</div>
                    </div>
                  ))}
                </div>
              );
            }

            if (cluster.side === "draft") {
              return (
                <div key={cluster.key} className="ml-auto max-w-[78%] space-y-1.5">
                  {cluster.items.map((m) => (
                    <div
                      key={m.id}
                      className="animar-entrada border border-dashed border-border bg-[var(--status-aguardando-bg)] px-2.5 py-1.5 text-sm"
                    >
                      <span className="mr-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                        Rascunho
                      </span>
                      <span className="whitespace-pre-wrap">{m.body}</span>
                      {(m.attachments ?? []).map((att) => (
                        <AttachmentView key={att.storageKey} att={att} outgoing />
                      ))}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{timeOnly(m.createdAt)}</span>
                        {onResend ? (
                          <button type="button" className="underline" disabled={resendPending} onClick={() => onResend(m.id)}>
                            Aprovar e enviar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            const outgoing = cluster.side === "out" || cluster.side === "failed";
            return (
              <div
                key={cluster.key}
                className={cn("flex max-w-[78%] flex-col gap-0.5", outgoing ? "ml-auto items-end" : "items-start")}
              >
                {cluster.items.map((m, idx) => {
                  const first = idx === 0;
                  const last = idx === cluster.items.length - 1;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "animar-entrada px-2.5 py-1.5 text-sm leading-snug",
                        outgoing
                          ? "bg-[color-mix(in_srgb,var(--brand)_10%,white)] text-foreground"
                          : "bg-muted/60 text-foreground",
                        first && last && "rounded-md",
                        first && !last && (outgoing ? "rounded-t-md rounded-bl-md" : "rounded-t-md rounded-br-md"),
                        !first && last && (outgoing ? "rounded-b-md rounded-tl-md" : "rounded-b-md rounded-tr-md"),
                        !first && !last && (outgoing ? "rounded-l-md" : "rounded-r-md"),
                      )}
                    >
                      {m.replyTo ? (
                        <p className="mb-1 truncate rounded border-l-2 border-border bg-black/5 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {m.replyTo.body}
                        </p>
                      ) : null}
                      <span className="whitespace-pre-wrap">{m.body}</span>
                      {(m.attachments ?? []).map((att) => (
                        <AttachmentView key={att.storageKey} att={att} outgoing={outgoing} />
                      ))}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{timeOnly(m.createdAt)}</span>
                        {outgoing && m.sendStatus === "sent" ? <span>enviado</span> : null}
                        {outgoing && m.sendStatus === "failed" ? <span className="font-medium text-[var(--danger)]">Falha no envio</span> : null}
                        {outgoing && m.sendStatus === "draft" ? <span>rascunho</span> : null}
                        {m.visibility === "publica" && onReply ? (
                          <button type="button" className="underline" onClick={() => onReply(m)}>
                            Responder
                          </button>
                        ) : null}
                        {outgoing && (m.sendStatus === "failed" || m.sendStatus === "draft") && onResend ? (
                          <button
                            type="button"
                            className="underline"
                            disabled={resendPending}
                            onClick={() => onResend(m.id)}
                          >
                            {m.sendStatus === "draft" ? "Aprovar e enviar" : "Reenviar"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
