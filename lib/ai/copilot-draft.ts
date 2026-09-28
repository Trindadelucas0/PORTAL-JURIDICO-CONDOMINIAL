import type { Prisma, PrismaClient, User } from "@prisma/client";
import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { isInternalOperationalDraft } from "@/lib/ai/client-draft-guard";
import { approvalService } from "@/lib/services/approval-service";
import { canSendPublicWhatsApp } from "@/lib/services/whatsapp-dispatch";

type ApproveFn = (user: User, messageId: string) => Promise<unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

async function loadRevision(db: PrismaClient, conversationId: string, version: number) {
  const revision = await db.aiTicketMemoryRevision.findFirst({
    where: { conversationId, version },
    include: {
      interaction: {
        select: {
          id: true,
          draftMessage: { select: { id: true, body: true, sendStatus: true } },
        },
      },
    },
  });
  if (!revision) throw notFound("Versão não encontrada");
  return revision;
}

export async function updateCopilotDraft(db: PrismaClient, conversationId: string, version: number, text: string) {
  const revision = await loadRevision(db, conversationId, version);
  const draft = revision.interaction?.draftMessage ?? null;
  if (draft && draft.sendStatus !== "draft") {
    throw unprocessable("Resposta já enviada não pode ser editada");
  }
  const current = asRecord(revision.summaryJson);
  const analise = typeof current.analise === "string" ? current.analise : null;
  if (isInternalOperationalDraft(text, analise)) {
    throw unprocessable("Análise interna não pode ser enviada ao cliente");
  }
  const summary = { ...current, respostaSugerida: text };
  await db.aiTicketMemoryRevision.update({
    where: { id: revision.id },
    data: { summaryJson: summary as Prisma.InputJsonValue },
  });
  if (draft) {
    await db.message.update({ where: { id: draft.id }, data: { body: text } });
  }
  return { version, texto: text };
}

export async function sendCopilotDraft(
  db: PrismaClient,
  user: User,
  conversationId: string,
  version: number,
  approve: ApproveFn = (actor, messageId) => approvalService.approve(actor, messageId),
) {
  if (!canSendPublicWhatsApp(user)) throw forbidden("Este perfil não pode responder o cliente");
  const revision = await loadRevision(db, conversationId, version);
  const summary = asRecord(revision.summaryJson);
  const stored = typeof summary.respostaSugerida === "string" ? summary.respostaSugerida.trim() : "";
  const draft = revision.interaction?.draftMessage ?? null;
  const texto = stored || draft?.body.trim() || "";
  if (!texto) throw unprocessable("Nenhum rascunho para enviar");
  const analise = typeof summary.analise === "string" ? summary.analise : null;
  if (isInternalOperationalDraft(texto, analise)) {
    throw unprocessable("Análise interna não pode ser enviada ao cliente");
  }
  if (draft && draft.sendStatus !== "draft" && draft.sendStatus !== "failed") {
    throw unprocessable("Somente rascunho antigo ou envio falho pode ser reenviado");
  }
  let messageId = draft?.id ?? null;
  if (!messageId) {
    const created = await db.message.create({
      data: {
        conversationId,
        ticketId: revision.ticketId,
        direction: "out",
        visibility: "publica",
        sendStatus: "draft",
        body: texto,
      },
    });
    messageId = created.id;
    if (revision.interaction?.id) {
      await db.aiInteraction.update({
        where: { id: revision.interaction.id },
        data: { draftMessageId: created.id, status: "succeeded" },
      });
    }
  } else if (draft && stored && draft.body !== stored && draft.sendStatus === "draft") {
    await db.message.update({ where: { id: draft.id }, data: { body: stored } });
  }
  return approve(user, messageId);
}
