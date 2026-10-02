import { isHumanReviewFallback } from "@/lib/ai/prompts/inbound-v2";
import { groupMessagesByDayAndSender } from "@/lib/ui/message-groups";
import { formatWhen } from "@/lib/ui-labels";
import { cn } from "@/lib/utils";

export type MessageBubbleItem = {
  id: string;
  body: string;
  direction: "in" | "out";
  visibility: "publica" | "interna";
  sendStatus?: string;
  automated?: boolean;
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

/** Rascunho com a frase de revisão humana não é resposta ao cliente: não vira bolha. */
export function isHiddenReviewDraft(m: Pick<MessageBubbleItem, "body" | "direction" | "visibility" | "sendStatus">): boolean {
  return m.visibility === "publica" && m.direction === "out" && m.sendStatus === "draft" && isHumanReviewFallback(m.body);
}

export type DraftCheck = Pick<MessageBubbleItem, "body" | "direction" | "visibility" | "sendStatus">;

export function sentPublicBodies(messages: DraftCheck[]): Set<string> {
  return new Set(
    messages
      .filter((m) => m.direction === "out" && m.visibility === "publica" && m.sendStatus === "sent")
      .map((m) => m.body.trim())
      .filter(Boolean),
  );
}

/** Rascunho cujo texto já foi enviado, ou que é a resposta sugerida corrente (envio só por Enviar ao cliente). */
export function isRedundantAiDraft(
  m: DraftCheck,
  { sentBodies, suggestedText }: { sentBodies: ReadonlySet<string>; suggestedText?: string | null },
): boolean {
  if (m.visibility !== "publica" || m.direction !== "out" || m.sendStatus !== "draft") return false;
  const body = m.body.trim();
  if (!body) return false;
  if (sentBodies.has(body)) return true;
  const suggested = suggestedText?.trim() ?? "";
  return suggested !== "" && body === suggested;
}

/** Faixa Aguardando aprovação: só o rascunho cujo texto é o do card nesta geração. Sem texto no card → some. */
export function pickApprovalDraft<T extends DraftCheck & { id: string }>(
  messages: T[],
  sentBodies: ReadonlySet<string>,
  suggestedText: string,
): T | null {
  const suggested = suggestedText.trim();
  if (!suggested) return null;
  const drafts = messages.filter(
    (m) =>
      m.visibility === "publica" &&
      m.sendStatus === "draft" &&
      !isHiddenReviewDraft(m) &&
      !isRedundantAiDraft(m, { sentBodies }),
  );
  for (let i = drafts.length - 1; i >= 0; i--) {
    if (drafts[i].body.trim() === suggested) return drafts[i];
  }
  return null;
}

export function MessageBubbles({
  messages,
  suggestedText,
  onReply,
  onResend,
  onApproveDraft,
  resendPending,
  selectedIds,
  onToggleSelect,
}: {
  messages: MessageBubbleItem[];
  suggestedText?: string | null;
  onReply?: (message: MessageBubbleItem) => void;
  onResend?: (messageId: string) => void;
  onApproveDraft?: (messageId: string) => void;
  resendPending?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (messageId: string) => void;
}) {
  const sentBodies = sentPublicBodies(messages);
  const days = groupMessagesByDayAndSender(
    messages.filter((m) => !isHiddenReviewDraft(m) && !isRedundantAiDraft(m, { sentBodies, suggestedText })),
  );
  const selectable = Boolean(selectedIds && onToggleSelect);

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <div key={day.dayKey} className="space-y-3">
          <div className="flex items-center gap-3" role="separator" aria-label={day.label}>
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium tracking-wide text-[var(--bubble-meta)] uppercase">{day.label}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {day.clusters.map((cluster) => {
            if (cluster.side === "interna") {
              return (
                <div key={cluster.key} className="space-y-1.5">
                  {cluster.items.map((m) => (
                    <div
                      key={m.id}
                      className="animar-entrada w-full border-l-2 border-amber-500/70 bg-amber-50 px-3 py-2 text-sm text-amber-950"
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
                        {onApproveDraft ? (
                          <button type="button" className="underline" disabled={resendPending} onClick={() => onApproveDraft(m.id)}>
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
            const failed = cluster.side === "failed";
            return (
              <div
                key={cluster.key}
                className={cn("flex max-w-[78%] flex-col gap-0.5", outgoing ? "ml-auto items-end" : "items-start")}
              >
                {cluster.items.map((m, idx) => {
                  const first = idx === 0;
                  const selected = Boolean(selectedIds?.has(m.id));
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "animar-entrada rounded-lg border px-2.5 py-1.5 text-sm leading-snug text-foreground shadow-sm",
                        failed
                          ? "border-red-200 bg-red-50"
                          : outgoing
                            ? "border-[var(--bubble-out-border)] bg-[var(--bubble-out)]"
                            : "border-border bg-card",
                        first && (outgoing ? "rounded-tr-none" : "rounded-tl-none"),
                        selected && "ring-1 ring-[var(--brand)]",
                      )}
                    >
                      {m.replyTo ? (
                        <p className="mb-1 truncate rounded border-l-2 border-border bg-black/5 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {m.replyTo.body}
                        </p>
                      ) : null}
                      {selectable ? (
                        <input
                          type="checkbox"
                          className="mr-1.5 size-3.5 cursor-pointer align-[-2px] accent-[var(--brand)]"
                          checked={selected}
                          aria-label={`Marcar mensagem das ${timeOnly(m.createdAt)} para o resumo`}
                          onChange={() => onToggleSelect?.(m.id)}
                        />
                      ) : null}
                      <span className="whitespace-pre-wrap">{m.body}</span>
                      {(m.attachments ?? []).map((att) => (
                        <AttachmentView key={att.storageKey} att={att} outgoing={outgoing} />
                      ))}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--bubble-meta)]">
                        {m.automated ? (
                          <span>Sistema · Automático · {timeOnly(m.createdAt)}</span>
                        ) : (
                          <span>{timeOnly(m.createdAt)}</span>
                        )}
                        {outgoing && !m.automated && m.sendStatus === "sent" ? <span>enviado</span> : null}
                        {outgoing && m.sendStatus === "failed" ? <span className="font-medium text-[var(--danger)]">Falha no envio</span> : null}
                        {outgoing && m.sendStatus === "draft" ? <span>rascunho</span> : null}
                        {m.visibility === "publica" && onReply ? (
                          <button type="button" className="underline" onClick={() => onReply(m)}>
                            Responder
                          </button>
                        ) : null}
                        {outgoing && m.sendStatus === "failed" && onResend ? (
                          <button
                            type="button"
                            className="underline"
                            disabled={resendPending}
                            onClick={() => onResend(m.id)}
                          >
                            Reenviar
                          </button>
                        ) : null}
                        {outgoing && m.sendStatus === "draft" && onApproveDraft ? (
                          <button
                            type="button"
                            className="underline"
                            disabled={resendPending}
                            onClick={() => onApproveDraft(m.id)}
                          >
                            Aprovar e enviar
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
