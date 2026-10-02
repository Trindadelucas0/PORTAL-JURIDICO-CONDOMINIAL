import type { Prisma, PrismaClient } from "@prisma/client";
import { completeValidJson, shouldMarkJobDead } from "@/lib/ai/complete-json";
import { otherCondominiumNamed } from "@/lib/ai/condo-name";
import { confidenceBand } from "@/lib/ai/confidence";
import { prismaErrorCode } from "@/lib/ai/errors";
import { keepCitations } from "@/lib/ai/citations";
import { decideTurn, type ServerFallback } from "@/lib/ai/decide-turn";
import { isAiAutoDraftEnabled, isAiEnabled, isAiMemoryEnabled, aiPromptVersion } from "@/lib/ai/flags";
import { rejectedDraftForJobs } from "@/lib/ai/enqueue";
import {
  loadInboundForJobs,
  loadSelectedMessages,
  relatoSplitForJobs,
  selectedIdsForJobs,
  type SelectedRow,
} from "@/lib/ai/inbound-messages";
import { insertInteractionOnceReplacingJsonFailure, isManualInboundKey } from "@/lib/ai/interaction";
import { shouldDispatchAiDraft, shouldPromoteTriageAsSystem } from "@/lib/ai/auto-actions";
import { gateClientDraft } from "@/lib/ai/client-draft-guard";
import { buildAnalysisFluxo, canalLabel, ingestaoFromGroups, type AnalysisFluxo, type FluxoMarcador } from "@/lib/ai/analysis-snapshot";
import { acceptedFactsForContact, normalizeContactFacts, proposedContactFacts } from "@/lib/ai/contact-memory";
import { advanceMemoryPointer, interactionKey } from "@/lib/ai/memory";
import { EMPTY_SUMMARY, mergePartialSummary, type SummaryJson, type SummaryTurn } from "@/lib/ai/output";
import { buildModelPackage, packageContainsSecret, packageMessages } from "@/lib/ai/package";
import { systemPromptFor } from "@/lib/ai/prompts/select";
import { PUBLIC_REPLY_REWRITE } from "@/lib/ai/prompts/inbound-v3";
import { publicReplyPendencia, revisarRespostaPublica } from "@/lib/ai/public-reply-guard";
import {
  EMPTY_CLIENT_DRAFT_REWRITE,
  FALLBACK_DOCUMENT_CONFLICT,
  FALLBACK_HUMAN_REVIEW,
  FALLBACK_INJECTION,
  FALLBACK_UNAVAILABLE,
  MARKED_MESSAGES_RULE,
  REJECTED_SUMMARY_REWRITE,
  RELATO_MESSAGES_RULE,
  RELATO_ONLY_RULE,
  SELECTED_MESSAGES_RULE,
} from "@/lib/ai/prompts/inbound-v2";
import { createAiProviderFromEnv, type AiProvider } from "@/lib/ai/provider";
import { aiMaxOutputTokens, aiTimeoutMs } from "@/lib/ai/env";
import { retrieveForConversation, type RetrievalChunk, type RetrievalResult } from "@/lib/ai/retriever";
import { classifyLocal } from "@/lib/ai/router";
import { dispatchToWhatsApp } from "@/lib/services/whatsapp-dispatch";
import { ticketService } from "@/lib/services/ticket-service";

export async function processConversation(db: PrismaClient, conversationId: string, provider: AiProvider | null = createAiProviderFromEnv()) {
  const started = Date.now();
  if (!isAiEnabled()) {
    await db.aiJob.updateMany({
      where: { conversationId, type: "ai.inbound", status: { in: ["queued", "running"] } },
      data: { status: "succeeded", lastErrorCode: "skipped", lockedAt: null },
    });
    return;
  }
  let jobIds: string[] = [];
  try {
    const jobs = await claimQueuedInbound(db, conversationId);
    if (jobs.length === 0) return;
    jobIds = jobs.map((job) => job.id);
    await audit(db, { action: "AI_STARTED", conversationId, jobId: jobIds[0], result: "ok" });

    const conversation = await db.conversation.findFirst({
      where: { id: conversationId },
      include: {
        condominium: { select: { nome: true, cidadeUf: true } },
        contact: { select: { id: true, nome: true, condominiumId: true } },
        connection: { select: { type: true } },
      },
    });
    if (!conversation?.condominiumId) {
      await finishJobs(db, jobIds, "succeeded", "out_of_flow");
      await audit(db, { action: "CONTEXT_RESOLVED", conversationId, result: "out_of_flow" });
      return;
    }
    if (conversation.contact?.condominiumId && conversation.contact.condominiumId !== conversation.condominiumId) {
      await audit(db, { action: "STALE_CONTEXT", conversationId, result: "context_mismatch" });
    }

    const openTickets = await db.ticket.findMany({
      where: { conversationId, status: { not: "resolvido" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    const ambiguous = openTickets.length > 1;
    const ticketId = openTickets.length === 1 ? openTickets[0].id : null;
    const split = relatoSplitForJobs(jobs);
    const replaceManualDraft = jobs.some((job) => isManualInboundKey(job.idempotencyKey));
    const jobRejectedDraft = rejectedDraftForJobs(jobs);
    const relato = split?.relatoIds.length
      ? (await loadSelectedMessages(db.message, conversationId, split.relatoIds)).filter((row) => row.direction === "in")
      : [];
    const marks = split?.markIds.length ? await loadSelectedMessages(db.message, conversationId, split.markIds) : [];
    if (split && marks.length === 0) {
      await processRelatoOnly(db, provider, {
        conversationId,
        ticketId,
        jobIds,
        relato,
        condominiumName: conversation.condominium?.nome || "Condomínio",
        city: conversation.condominium?.cidadeUf ?? null,
        replaceManualDraft,
        rejectedDraft: jobRejectedDraft,
      });
      return;
    }
    const selectedIds = split ? null : selectedIdsForJobs(jobs);
    const selected = split ? marks : selectedIds ? await loadSelectedMessages(db.message, conversationId, selectedIds) : null;
    const allowAbstainDraft = Boolean(selected?.length);
    const inbound = selected ?? await loadInboundForJobs(
      db.message,
      conversationId,
      jobs.map((job) => job.idempotencyKey),
    );
    const messageLimit = selected ? selected.length : undefined;
    const messageIds = [...new Set([...inbound.map((row) => row.id), ...relato.map((row) => row.id)])];
    const joined = inbound.map((row) => row.body).join("\n").slice(0, 4000);
    const intent = classifyLocal(joined);
    const retrieval = await retrieveForConversation(
      db as unknown as Parameters<typeof retrieveForConversation>[0],
      conversationId,
      null,
      joined,
    );
    const chunks = retrieval.chunks;
    await audit(db, {
      action: "RAG_SEARCHED",
      conversationId,
      ticketId,
      result: `chunks:${chunks.length}:${retrieval.motivo}`,
    });

    const memory = await db.aiTicketMemory.findUnique({ where: { conversationId } });
    const currentVersion = memory?.version ?? 0;
    const key = split
      ? interactionKey([...inbound.map((row) => row.id), ...relato.map((row) => `relato:${row.id}`)])
      : interactionKey(messageIds.length ? messageIds : jobIds);
    const previous = split || replaceManualDraft ? await loadPreviousTurn(db, conversationId, currentVersion) : null;
    /** Com marcas, o parágrafo é desta execução. Sem marcas, o merge copia o lado que não foi gerado. */
    const splitSummary = (summary: SummaryJson, fromRelato: boolean): SummaryJson =>
      split && !selected
        ? mergePartialSummary({
            fromRelato,
            fromMarks: true,
            next: { summary, analysis: EMPTY_ANALYSIS, clientDraft: null },
            previous,
            emptyAnalysis: EMPTY_ANALYSIS,
          }).summary
        : summary;
    const ingestGroups = await db.officeDocument.groupBy({
      by: ["ingestStatus"],
      where: { condominiumId: conversation.condominiumId },
      _count: { _all: true },
    });
    const ingestao = ingestaoFromGroups(
      ingestGroups.map((row) => ({ ingestStatus: row.ingestStatus, count: row._count._all })),
    );
    const mensagem = await loadTriggerMessage(
      db,
      selected ? selected.filter((row) => row.direction === "in") : inbound,
      conversation,
    );
    let memorySummary: string | null = null;
    let memoryCreatedAt: string | null = null;
    if (isAiMemoryEnabled() && currentVersion > 0) {
      const current = await db.aiTicketMemoryRevision.findFirst({
        where: { conversationId, version: currentVersion },
        select: { summaryJson: true, createdAt: true },
      });
      memorySummary = summaryPreview(current?.summaryJson);
      memoryCreatedAt = current?.createdAt ? current.createdAt.toISOString() : null;
    }
    const contactFacts = await acceptedFactsForContact(db, conversation.contact?.id);
    const rule = conversation.condominiumId
      ? await db.aiCondominiumRule.findFirst({
          where: { condominiumId: conversation.condominiumId },
          orderBy: { version: "desc" },
          select: { body: true },
        })
      : null;
    const condominiumRule = rule?.body?.trim() ? rule.body : null;
    const fluxoBase = {
      retrieval,
      ingestao,
      mensagem,
      condominioNome: conversation.condominium?.nome ?? null,
      mensagensCarregadas: inbound.length,
      mensagensNoPacote: selected ? packageMessages(inbound, messageLimit).length : null,
      memorySummary,
      memoryVersion: currentVersion,
      memoryCreatedAt,
      contactFacts,
    };

    if (await overDailyBudget(db, ticketId, conversationId)) {
      await persistTurn(db, {
        conversationId,
        ticketId,
        key,
        messageIds,
        jobIds,
        currentVersion,
        replaceManualDraft,
        allowAbstainDraft,
        chunks: [],
        draftText: null,
        abstain: true,
        injection: false,
        summary: splitSummary({ ...EMPTY_SUMMARY, pendencias: "Limite diário da IA.", analise: "Limite diário." }, false),
        analysis: { intencao: intent, risco: "medio", conflitos: [], motivoEscalonamento: "limite_diario", confianca: "insuficiente" },
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        extraActions: [],
        fluxo: fluxoParado(fluxoBase, { llm: "falhou", validacao: "ok", citations: "falhou" }),
      });
      return;
    }

    if (intent === "injection" || ambiguous) {
      await persistTurn(db, {
        conversationId,
        ticketId,
        key,
        messageIds,
        jobIds,
        currentVersion,
        replaceManualDraft,
        allowAbstainDraft,
        chunks,
        draftText: intent === "injection" ? FALLBACK_INJECTION : null,
        abstain: true,
        injection: intent === "injection",
        serverFallback: intent === "injection" ? "injection" : null,
        summary: splitSummary({
          contexto: ambiguous ? "Há mais de um chamado aberto nesta conversa." : "Pedido fora do atendimento.",
          problema: ambiguous ? "A IA não escolhe o chamado." : joined.slice(0, 500),
          documentos: "",
          analise: intent === "injection" ? "injection_signal" : "ABSTAIN",
          pendencias: ambiguous ? "Humano escolhe o chamado." : "",
          proximaAcao: ambiguous ? "Escolher o chamado na ficha." : "Aguardar o humano.",
        }, false),
        analysis: {
          intencao: intent,
          risco: "alto",
          conflitos: [],
          motivoEscalonamento: ambiguous ? "chamados_ambiguos" : "injection_signal",
          confianca: "insuficiente",
        },
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        extraActions: intent === "injection" ? ["SEND_WHATSAPP", "SEND_DOCUMENT"] : [],
        fluxo: fluxoParado(fluxoBase, { llm: "falhou", validacao: "ok", citations: "falhou" }),
      });
      return;
    }

    if (intent === "saudacao" || !provider) {
      await persistTurn(db, {
        conversationId,
        ticketId,
        key,
        messageIds,
        jobIds,
        currentVersion,
        replaceManualDraft,
        allowAbstainDraft,
        chunks,
        draftText: null,
        abstain: true,
        injection: false,
        summary: splitSummary({
          ...EMPTY_SUMMARY,
          contexto: intent === "saudacao" ? "Saudação sem pergunta." : FALLBACK_UNAVAILABLE,
          pendencias: provider ? "" : FALLBACK_UNAVAILABLE,
          analise: "ABSTAIN",
        }, false),
        analysis: {
          intencao: intent,
          risco: "baixo",
          conflitos: [],
          motivoEscalonamento: provider ? null : "sem_provedor",
          confianca: "insuficiente",
        },
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        extraActions: [],
        fluxo: fluxoParado(fluxoBase, { llm: "falhou", validacao: "ok", citations: "falhou" }),
      });
      return;
    }

    const others = await db.condominium.findMany({
      where: { deletedAt: null },
      select: { nome: true },
    });
    const namedOther = otherCondominiumNamed(
      joined,
      conversation.condominium?.nome || "",
      others.map((row) => row.nome),
    );

    const modelName = process.env.AI_MODEL_MAIN?.trim() || "main";
    const rejectedDraft = jobRejectedDraft || previous?.clientDraft || null;
    const rejectedContexto = previous?.summary.contexto?.trim() || null;
    const rewrite = rejectedDraft || rejectedContexto ? `\n${REJECTED_SUMMARY_REWRITE}` : "";
    const packageInput = {
      system: `${
        selected
          ? `${systemPromptFor()}\n${SELECTED_MESSAGES_RULE}`
          : split
            ? [systemPromptFor(), MARKED_MESSAGES_RULE, relato.length ? RELATO_MESSAGES_RULE : ""].filter(Boolean).join("\n")
            : systemPromptFor()
      }${rewrite}`,
      model: modelName,
      condominiumName: conversation.condominium?.nome || "Condomínio",
      city: conversation.condominium?.cidadeUf ?? null,
      memorySummary,
      contactFacts,
      condominiumRule,
      messages: inbound,
      messageLimit,
      relato: selected ? [] : relato,
      chunks: chunks.map((row) => ({ id: row.id, content: row.content, corpus: row.corpus })),
      rejectedDraft,
      rejectedContexto,
    };
    const packed = buildModelPackage(packageInput);
    if (packageContainsSecret(JSON.stringify(packed))) {
      await finishJobs(db, jobIds, "succeeded", "secret_blocked");
      await audit(db, { action: "ACTION_BLOCKED", conversationId, ticketId, result: "secret_blocked" });
      return;
    }

    const valid = await completeValidJson(provider, {
      system: packed.system,
      user: packed.user,
      model: modelName,
      maxTokens: aiMaxOutputTokens(),
      timeoutMs: aiTimeoutMs(),
    });
    if (!valid.ok) {
      await persistTurn(db, {
        conversationId,
        ticketId,
        key,
        messageIds,
        jobIds,
        currentVersion,
        replaceManualDraft,
        allowAbstainDraft,
        chunks,
        draftText: null,
        abstain: true,
        injection: false,
        serverFallback: "human_review",
        summary: splitSummary({
          ...EMPTY_SUMMARY,
          contexto: "A saída do modelo não passou na validação.",
          pendencias: valid.reason
            ? `JSON inválido após retry. ${valid.reason}`
            : "JSON inválido após retry.",
          analise: FALLBACK_HUMAN_REVIEW,
          proximaAcao: "Revisão humana.",
        }, false),
        analysis: {
          intencao: intent,
          risco: "alto",
          conflitos: namedOther ? ["outro_condominio"] : [],
          motivoEscalonamento: "json_invalido",
          confianca: "insuficiente",
        },
        model: modelName,
        inputTokens: valid.inputTokens,
        outputTokens: valid.outputTokens,
        extraActions: [],
        fluxo: fluxoParado(fluxoBase, { llm: "ok", validacao: "falhou", citations: "falhou" }),
      });
      return;
    }
    const activeProvider = provider;
    let jsonForReview = valid;
    let extraInput = 0;
    let extraOutput = 0;
    if (allowAbstainDraft && !valid.parsed.clientDraft?.trim()) {
      const filled = await completeValidJson(activeProvider, {
        system: `${packed.system}\n${EMPTY_CLIENT_DRAFT_REWRITE}`,
        user: packed.user,
        model: modelName,
        maxTokens: aiMaxOutputTokens(),
        timeoutMs: aiTimeoutMs(),
      });
      if (filled.ok && filled.parsed.clientDraft?.trim()) {
        extraInput += valid.completion.inputTokens;
        extraOutput += valid.completion.outputTokens;
        jsonForReview = filled;
      } else if (filled.ok) {
        extraInput += filled.completion.inputTokens;
        extraOutput += filled.completion.outputTokens;
      }
    }
    const revisao = await revisarRespostaPublica({
      first: jsonForReview,
      mensagemCliente: joined,
      skip: Boolean(jsonForReview.parsed.analysis.injectionSignal) || (jsonForReview.parsed.abstain && !allowAbstainDraft),
      regenerate: async (rejectedDraft) => {
        const retry = buildModelPackage({ ...packageInput, rejectedDraft });
        if (packageContainsSecret(JSON.stringify(retry))) return { ok: false, reason: "secret_blocked" };
        return completeValidJson(activeProvider, {
          system: `${retry.system}\n${PUBLIC_REPLY_REWRITE}`,
          user: retry.user,
          model: modelName,
          maxTokens: aiMaxOutputTokens(),
          timeoutMs: aiTimeoutMs(),
        });
      },
    });
    for (const result of revisao.trail) {
      await audit(db, { action: "PUBLIC_REPLY", conversationId, ticketId, result });
    }
    const { parsed, completion, raw } = revisao.output;
    const publicDiscarded = revisao.verdict.status === "reprovar";
    const allowed = new Set(chunks.map((row) => row.id));
    const cited = keepCitations(parsed.citations, allowed);
    const distanceById = new Map(chunks.map((row) => [row.id, row.distance ?? null]));
    const band = confidenceBand(cited.map((row) => distanceById.get(row.chunkId)));
    const injectionFromModel = Boolean(parsed.analysis.injectionSignal);
    const forceAbstain =
      parsed.abstain || injectionFromModel || band === "insuficiente" || Boolean(namedOther) || publicDiscarded;
    const conflitos = [
      ...parsed.analysis.conflitos,
      ...(namedOther ? ["outro_condominio"] : []),
    ];
    const proposedDraft = injectionFromModel
      ? FALLBACK_INJECTION
      : (namedOther && forceAbstain) || publicDiscarded
        ? null
        : parsed.clientDraft || null;
    const gated = gateClientDraft({
      clientDraft: proposedDraft,
      analise: parsed.summary.analise,
      injection: injectionFromModel,
    });
    const draftText = gated.draftText;
    const serverFallback: ServerFallback | null = injectionFromModel
      ? "injection"
      : gated.leaked || publicDiscarded
        ? "human_review"
        : null;
    const summary = splitSummary(
      namedOther
        ? { ...parsed.summary, pendencias: parsed.summary.pendencias || FALLBACK_DOCUMENT_CONFLICT }
        : parsed.summary,
      relato.length > 0,
    );
    const avisos = [
      gated.leaked ? "Rascunho não publicado: o texto parecia análise interna." : null,
      publicReplyPendencia(revisao.verdict),
    ].filter((line): line is string => Boolean(line));
    const rawActions = readRawActions(raw);
    await persistTurn(db, {
      conversationId,
      ticketId,
      key,
      messageIds,
      jobIds,
      currentVersion,
      replaceManualDraft,
      allowAbstainDraft,
      chunks,
      draftText,
      abstain: (forceAbstain && !injectionFromModel) || gated.leaked,
      injection: injectionFromModel,
      serverFallback,
      summary: avisos.length
        ? { ...summary, pendencias: [summary.pendencias, ...avisos].filter(Boolean).join("\n") }
        : summary,
      analysis: {
        ...parsed.analysis,
        conflitos,
        confianca: band,
        motivoEscalonamento: namedOther
          ? "outro_condominio"
          : publicDiscarded
            ? "resposta_publica"
            : gated.leaked
              ? "rascunho_interno"
              : parsed.analysis.motivoEscalonamento,
      },
      model: completion.model,
      inputTokens: revisao.inputTokens + extraInput,
      outputTokens: revisao.outputTokens + extraOutput,
      extraActions: rawActions,
      cited,
      contactFacts: normalizeContactFacts(parsed.contactFacts),
      contactId: conversation.contact?.id ?? null,
      fluxo: fluxoParado(fluxoBase, {
        llm: "ok",
        validacao: "ok",
        citations: "ok",
        citedCount: cited.length,
      }),
    });
    console.log(
      JSON.stringify({
        jobId: jobIds[0],
        conversationId,
        ticketId,
        durationMs: Date.now() - started,
        model: completion.model,
        inputTokens: revisao.inputTokens + extraInput,
        outputTokens: revisao.outputTokens + extraOutput,
        status: "succeeded",
        errorCode: null,
        riskLevel: parsed.analysis.risco,
        chunkCount: chunks.length,
        publicReply: revisao.trail.join(",") || "ok",
      }),
    );
  } catch (error) {
    const code = prismaErrorCode(error) === "ERROR" && error instanceof Error && "code" in error
      ? String((error as { code: unknown }).code)
      : error instanceof SyntaxError || error instanceof Error && error.name === "ZodError"
        ? "ZOD"
        : prismaErrorCode(error);
    if (jobIds.length) {
      const rows = await db.aiJob.findMany({ where: { id: { in: jobIds } }, select: { attempts: true } });
      const attempts = Math.max(...rows.map((row) => row.attempts), 1);
      if (shouldMarkJobDead(code, attempts)) {
        await finishJobs(db, jobIds, "dead", code);
        await audit(db, { action: "JOB_DEAD", conversationId, result: code });
      } else {
        await db.aiJob.updateMany({
          where: { id: { in: jobIds } },
          data: { status: "queued", lockedAt: null, lastErrorCode: code, runAfter: new Date(Date.now() + 40_000) },
        });
        await audit(db, { action: "JOB_RETRIED", conversationId, result: code });
      }
    }
    console.log(JSON.stringify({ conversationId, durationMs: Date.now() - started, status: "failed", errorCode: code }));
  }
}

type PersistInput = {
  conversationId: string;
  ticketId: string | null;
  key: string;
  messageIds: string[];
  jobIds: string[];
  currentVersion: number;
  chunks: RetrievalChunk[];
  draftText: string | null;
  abstain: boolean;
  injection: boolean;
  summary: SummaryJson;
  analysis: {
    intencao: string;
    risco: "baixo" | "medio" | "alto" | string;
    conflitos: string[];
    motivoEscalonamento: string | null;
    confianca: string;
  };
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  extraActions: string[];
  cited?: Array<{ chunkId: string }>;
  serverFallback?: ServerFallback | null;
  contactFacts?: string[];
  contactId?: string | null;
  fluxo: AnalysisFluxo;
  allowAbstainDraft?: boolean;
  replaceManualDraft?: boolean;
};

async function persistTurn(db: PrismaClient, input: PersistInput) {
  const decision = decideTurn({
    autoDraft: isAiAutoDraftEnabled(),
    memoryEnabled: isAiMemoryEnabled(),
    abstain: input.abstain,
    injection: input.injection,
    serverFallback: input.serverFallback ?? null,
    requestedActions: ["CREATE_DRAFT", "WRITE_TICKET_MEMORY", ...input.extraActions],
    interactionExists: false,
    currentVersion: input.currentVersion,
    expectedVersion: input.currentVersion,
    draftText: input.draftText,
    summary: input.summary,
    allowAbstainDraft: input.allowAbstainDraft,
  });
  for (const action of decision.blockedActions) {
    await audit(db, {
      action: "ACTION_BLOCKED",
      conversationId: input.conversationId,
      ticketId: input.ticketId,
      result: action,
    });
  }

  const claim = await insertInteractionOnceReplacingJsonFailure(
    db,
    {
      conversationId: input.conversationId,
      ticketId: input.ticketId,
      idempotencyKey: input.key,
      status: decision.draftBody ? "succeeded" : "abstained",
      riskLevel: input.analysis.risco === "alto" ? "HIGH" : input.analysis.risco === "baixo" ? "LOW" : "MEDIUM",
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      contextVersion: aiPromptVersion(),
      analysisJson: {
        intencao: input.analysis.intencao,
        risco: input.analysis.risco,
        conflitos: input.analysis.conflitos,
        motivoEscalonamento: input.analysis.motivoEscalonamento,
        confianca: input.analysis.confianca,
        injectionSignal: input.injection,
      },
    },
    { replaceManualDraft: Boolean(input.replaceManualDraft) },
  );
  if (claim === "duplicate") {
    await finishJobs(db, input.jobIds, "succeeded", "duplicate_interaction");
    return;
  }

  const interaction = await db.aiInteraction.findUnique({ where: { idempotencyKey: input.key } });
  if (decision.draftBody && interaction) {
    const draft = await db.message.create({
      data: {
        conversationId: input.conversationId,
        ticketId: input.ticketId,
        direction: "out",
        visibility: "publica",
        sendStatus: "draft",
        body: decision.draftBody,
      },
    });
    await db.aiInteraction.update({
      where: { id: interaction.id },
      data: { draftMessageId: draft.id, status: "succeeded" },
    });
    await audit(db, {
      action: "AI_GENERATED_DRAFT",
      conversationId: input.conversationId,
      ticketId: input.ticketId,
      interactionId: interaction.id,
      result: "draft",
    });
    if (
      !input.abstain &&
      shouldDispatchAiDraft({ injection: input.injection, serverFallback: input.serverFallback })
    ) {
      const admin = await firstAdminUser(db);
      if (admin) {
        try {
          await dispatchToWhatsApp(db, admin, draft.id);
          await audit(db, {
            action: "AI_AUTO_SENT",
            conversationId: input.conversationId,
            ticketId: input.ticketId,
            interactionId: interaction.id,
            result: "sent",
            actorId: admin.id,
          });
        } catch {
          await audit(db, {
            action: "AI_AUTO_SENT",
            conversationId: input.conversationId,
            ticketId: input.ticketId,
            interactionId: interaction.id,
            result: "failed",
          });
        }
      }
    }
  } else if (interaction) {
    await audit(db, {
      action: "ABSTAIN",
      conversationId: input.conversationId,
      ticketId: input.ticketId,
      interactionId: interaction.id,
      result: "abstain",
    });
  }

  if (decision.writeMemory && interaction) {
    const wrote = await advanceMemoryPointer(db, input.conversationId, input.currentVersion, input.ticketId);
    if (wrote && decision.memoryVersion) {
      const revision = await db.aiTicketMemoryRevision.create({
        data: {
          conversationId: input.conversationId,
          ticketId: input.ticketId,
          version: decision.memoryVersion,
          interactionId: interaction.id,
          summaryJson: summaryPayload(input),
        },
      });
      if (input.messageIds.length) {
        await db.aiTicketMemoryMessage.createMany({
          data: input.messageIds.map((messageId) => ({ revisionId: revision.id, messageId })),
        });
      }
      await audit(db, {
        action: "MEMORY_CREATED",
        conversationId: input.conversationId,
        ticketId: input.ticketId,
        interactionId: interaction.id,
        result: `v${decision.memoryVersion}`,
      });
    }
  }

  if (interaction && input.cited?.length) {
    const byId = new Map(input.chunks.map((row) => [row.id, row]));
    await db.aiCitation.createMany({
      data: input.cited.flatMap((row, index) => {
        const chunk = byId.get(row.chunkId);
        if (!chunk) return [];
        return [{
          interactionId: interaction.id,
          chunkId: chunk.id,
          rank: index + 1,
          distance: chunk.distance ?? null,
          documentId: chunk.documentId ?? null,
          pageNumber: chunk.pageNumber ?? null,
        }];
      }),
    });
  }

  if (interaction && input.contactId && input.contactFacts?.length) {
    await proposedContactFacts(db, {
      contactId: input.contactId,
      facts: input.contactFacts,
      sourceInteractionId: interaction.id,
    });
  }

  await audit(db, {
    action: "AI_GENERATED_INTERNAL_ANALYSIS",
    conversationId: input.conversationId,
    ticketId: input.ticketId,
    interactionId: interaction?.id,
    result: input.analysis.confianca,
  });

  await maybePromoteTriage(db, input);
  await finishJobs(db, input.jobIds, "succeeded", null);
}

type TurnAnalysis = PersistInput["analysis"];

const EMPTY_ANALYSIS: TurnAnalysis = {
  intencao: "",
  risco: "",
  conflitos: [],
  motivoEscalonamento: null,
  confianca: "",
};

type PreviousTurn = SummaryTurn<TurnAnalysis> & {
  draftSent: boolean;
  status: string | null;
  summaryJson: Record<string, unknown>;
  citations: Array<{ chunkId: string; rank: number; distance: number | null; documentId: string | null; pageNumber: number | null }>;
};

/** Revisão corrente, para copiar o lado (relato ou marcas) que a execução não gerou. */
async function loadPreviousTurn(db: PrismaClient, conversationId: string, version: number): Promise<PreviousTurn | null> {
  if (version < 1) return null;
  const row = await db.aiTicketMemoryRevision.findFirst({
    where: { conversationId, version },
    select: {
      summaryJson: true,
      interaction: {
        select: {
          status: true,
          draftMessage: { select: { body: true, sendStatus: true } },
          citations: {
            orderBy: { rank: "asc" },
            select: { chunkId: true, rank: true, distance: true, documentId: true, pageNumber: true },
          },
        },
      },
    },
  });
  if (!row) return null;
  const json = asRecord(row.summaryJson);
  const tecnica = asRecord(json.tecnica);
  const draft = row.interaction?.draftMessage ?? null;
  const clientDraft = Object.prototype.hasOwnProperty.call(json, "respostaSugerida")
    ? textOrNull(json.respostaSugerida)
    : textOrNull(draft?.body);
  return {
    summary: {
      contexto: text(json.contexto),
      problema: text(json.problema),
      documentos: text(json.documentos),
      analise: text(json.analise),
      pendencias: text(json.pendencias),
      proximaAcao: text(json.proximaAcao),
    },
    analysis: {
      intencao: text(tecnica.intencao),
      risco: text(tecnica.risco),
      conflitos: Array.isArray(tecnica.conflitos) ? tecnica.conflitos.filter((item): item is string => typeof item === "string") : [],
      motivoEscalonamento: textOrNull(tecnica.motivoEscalonamento),
      confianca: text(tecnica.confianca),
    },
    clientDraft,
    draftSent: draft?.sendStatus === "sent",
    status: row.interaction?.status ?? null,
    summaryJson: json,
    citations: row.interaction?.citations ?? [],
  };
}

/**
 * Atendimento sem marca: só `contexto` sai do modelo (`<RELATO_DATA>`). Intenção, análise, documentos,
 * fluxo e resposta sugerida vêm da revisão corrente. Não cria rascunho nem chama WhatsApp.
 * Saídas antecipadas (injection, sem provedor, limite, JSON inválido) não gravam revisão.
 */
async function processRelatoOnly(
  db: PrismaClient,
  provider: AiProvider | null,
  input: {
    conversationId: string;
    ticketId: string | null;
    jobIds: string[];
    relato: SelectedRow[];
    condominiumName: string;
    city: string | null;
    replaceManualDraft?: boolean;
    rejectedDraft?: string | null;
  },
) {
  const { conversationId, ticketId, jobIds, relato } = input;
  const stop = async (code: string) => {
    await finishJobs(db, jobIds, "failed", code);
    await audit(db, { action: "ABSTAIN", conversationId, ticketId, result: `relato:${code}` });
  };
  if (!relato.length) return stop("sem_mensagens");
  const joined = relato.map((row) => row.body).join("\n").slice(0, 4000);
  if (classifyLocal(joined) === "injection") return stop("injection_signal");
  if (!provider) return stop("sem_provedor");
  if (await overDailyBudget(db, ticketId, conversationId)) return stop("limite_diario");

  const memory = await db.aiTicketMemory.findUnique({ where: { conversationId } });
  const currentVersion = memory?.version ?? 0;
  const previous = await loadPreviousTurn(db, conversationId, currentVersion);
  const modelName = process.env.AI_MODEL_MAIN?.trim() || "main";
  const rejectedDraft = input.rejectedDraft || previous?.clientDraft || null;
  const rejectedContexto = previous?.summary.contexto?.trim() || null;
  const packed = buildModelPackage({
    system: [
      systemPromptFor(),
      RELATO_MESSAGES_RULE,
      RELATO_ONLY_RULE,
      rejectedDraft || rejectedContexto ? REJECTED_SUMMARY_REWRITE : "",
    ]
      .filter(Boolean)
      .join("\n"),
    model: modelName,
    condominiumName: input.condominiumName,
    city: input.city,
    memorySummary: null,
    messages: [],
    relato,
    chunks: [],
    rejectedDraft,
    rejectedContexto,
  });
  if (packageContainsSecret(JSON.stringify(packed))) {
    await finishJobs(db, jobIds, "succeeded", "secret_blocked");
    await audit(db, { action: "ACTION_BLOCKED", conversationId, ticketId, result: "secret_blocked" });
    return;
  }
  const valid = await completeValidJson(provider, {
    system: packed.system,
    user: packed.user,
    model: modelName,
    maxTokens: aiMaxOutputTokens(),
    timeoutMs: aiTimeoutMs(),
  });
  if (!valid.ok) return stop("json_invalido");

  const merged = mergePartialSummary({
    fromRelato: true,
    fromMarks: false,
    next: { summary: valid.parsed.summary, analysis: EMPTY_ANALYSIS, clientDraft: null },
    previous,
    emptyAnalysis: EMPTY_ANALYSIS,
  });
  await persistRelatoTurn(db, {
    conversationId,
    ticketId,
    jobIds,
    relatoIds: relato.map((row) => row.id),
    currentVersion,
    previous,
    merged,
    model: valid.completion.model,
    inputTokens: valid.completion.inputTokens,
    outputTokens: valid.completion.outputTokens,
    replaceManualDraft: Boolean(input.replaceManualDraft),
  });
}

async function persistRelatoTurn(
  db: PrismaClient,
  input: {
    conversationId: string;
    ticketId: string | null;
    jobIds: string[];
    relatoIds: string[];
    currentVersion: number;
    previous: PreviousTurn | null;
    merged: SummaryTurn<TurnAnalysis>;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    replaceManualDraft?: boolean;
  },
) {
  const { merged, previous } = input;
  const decision = decideTurn({
    autoDraft: false,
    memoryEnabled: isAiMemoryEnabled(),
    abstain: true,
    injection: false,
    requestedActions: ["WRITE_TICKET_MEMORY"],
    interactionExists: false,
    currentVersion: input.currentVersion,
    expectedVersion: input.currentVersion,
    draftText: null,
    summary: merged.summary,
  });
  const key = interactionKey(input.relatoIds.map((id) => `relato:${id}`));
  const claim = await insertInteractionOnceReplacingJsonFailure(
    db,
    {
      conversationId: input.conversationId,
      ticketId: input.ticketId,
      idempotencyKey: key,
      status: previous?.status ?? "succeeded",
      riskLevel: merged.analysis.risco === "alto" ? "HIGH" : merged.analysis.risco === "baixo" ? "LOW" : "MEDIUM",
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      contextVersion: aiPromptVersion(),
      analysisJson: { ...merged.analysis, injectionSignal: false },
    },
    { replaceManualDraft: Boolean(input.replaceManualDraft) },
  );
  if (claim === "duplicate") {
    await finishJobs(db, input.jobIds, "succeeded", "duplicate_interaction");
    return;
  }
  const interaction = await db.aiInteraction.findUnique({ where: { idempotencyKey: key } });
  if (interaction && previous?.citations.length) {
    await db.aiCitation.createMany({
      data: previous.citations.map((row) => ({ ...row, interactionId: interaction.id })),
    });
  }
  if (decision.writeMemory && interaction) {
    const wrote = await advanceMemoryPointer(db, input.conversationId, input.currentVersion, input.ticketId);
    if (wrote && decision.memoryVersion) {
      const base = previous?.summaryJson ?? { tecnica: { ...EMPTY_ANALYSIS, trechos: [] } };
      const revision = await db.aiTicketMemoryRevision.create({
        data: {
          conversationId: input.conversationId,
          ticketId: input.ticketId,
          version: decision.memoryVersion,
          interactionId: interaction.id,
          summaryJson: { ...base, ...merged.summary, respostaSugerida: merged.clientDraft } as Prisma.InputJsonValue,
        },
      });
      await db.aiTicketMemoryMessage.createMany({
        data: input.relatoIds.map((messageId) => ({ revisionId: revision.id, messageId })),
      });
      await audit(db, {
        action: "MEMORY_CREATED",
        conversationId: input.conversationId,
        ticketId: input.ticketId,
        interactionId: interaction.id,
        result: `v${decision.memoryVersion}:relato`,
      });
    }
  }
  await finishJobs(db, input.jobIds, "succeeded", null);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function summaryPayload(input: PersistInput): Prisma.InputJsonValue {
  const trechos = (input.cited ?? []).flatMap((row) => {
    const chunk = input.chunks.find((item) => item.id === row.chunkId);
    if (!chunk) return [];
    return [{
      titulo: chunk.title?.trim() || "",
      pagina: chunk.pageNumber ?? null,
      distancia: chunk.distance ?? null,
    }];
  });
  return {
    ...input.summary,
    tecnica: {
      intencao: input.analysis.intencao,
      risco: input.analysis.risco,
      conflitos: input.analysis.conflitos,
      confianca: input.analysis.confianca,
      motivoEscalonamento: input.analysis.motivoEscalonamento,
      trechos,
    },
    fluxo: input.fluxo,
    respostaSugerida: input.draftText,
  };
}

type FluxoBase = {
  retrieval: RetrievalResult;
  ingestao: AnalysisFluxo["documentosPorIngestao"];
  mensagem: AnalysisFluxo["mensagem"];
  condominioNome: string | null;
  mensagensCarregadas: number;
  mensagensNoPacote: number | null;
  memorySummary: string | null;
  memoryVersion: number;
  memoryCreatedAt: string | null;
  contactFacts: string[];
};

function fluxoParado(
  base: FluxoBase,
  step: { llm: FluxoMarcador; validacao: FluxoMarcador; citations: FluxoMarcador; citedCount?: number },
): AnalysisFluxo {
  return buildAnalysisFluxo({
    condominioNome: base.condominioNome,
    condominioIdentificado: true,
    mensagem: base.mensagem,
    mensagensCarregadas: base.mensagensCarregadas,
    mensagensNoPacote: base.mensagensNoPacote,
    memorySummary: base.memorySummary,
    memoryVersion: base.memoryVersion,
    memoryCreatedAt: base.memoryCreatedAt,
    contactFacts: base.contactFacts,
    documentosPorIngestao: base.ingestao,
    ragMotivo: base.retrieval.motivo,
    chunks: base.retrieval.chunks,
    citedCount: step.citedCount ?? 0,
    llm: step.llm,
    validacao: step.validacao,
    citations: step.citations,
    conversaOk: true,
  });
}

async function loadTriggerMessage(
  db: PrismaClient,
  inbound: Array<{ id: string; body: string }>,
  conversation: {
    contact: { nome: string } | null;
    peerDisplayName: string | null;
    connection: { type: string };
  },
): Promise<AnalysisFluxo["mensagem"]> {
  const last = inbound[inbound.length - 1];
  if (!last) return null;
  const row = await db.message.findFirst({
    where: { id: last.id },
    select: { body: true, createdAt: true },
  });
  return {
    body: (row?.body ?? last.body).slice(0, 4000),
    createdAt: row?.createdAt ? row.createdAt.toISOString() : "",
    remetente: conversation.contact?.nome?.trim() || conversation.peerDisplayName?.trim() || "Cliente",
    canal: canalLabel(conversation.connection.type),
  };
}

function summaryPreview(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as { contexto?: unknown; problema?: unknown };
  const text = [row.contexto, row.problema].filter((item) => typeof item === "string").join(" ");
  return text ? text.slice(0, 400) : null;
}

function readRawActions(text: string): string[] {
  try {
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
    const raw = JSON.parse(cleaned) as { actions?: unknown };
    if (!Array.isArray(raw.actions)) return [];
    return raw.actions.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

async function overDailyBudget(db: PrismaClient, ticketId: string | null, conversationId: string): Promise<boolean> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const where = ticketId ? { ticketId, createdAt: { gte: start } } : { conversationId, createdAt: { gte: start } };
  const agg = await db.aiInteraction.aggregate({
    where,
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true },
  });
  const tokens = (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
  const maxInteractions = Number(process.env.AI_MAX_INTERACTIONS_PER_TICKET_PER_DAY ?? 40);
  const maxTokens = Number(process.env.AI_MAX_TOKENS_PER_DAY ?? 200000);
  return agg._count._all >= maxInteractions || tokens >= maxTokens;
}

async function finishJobs(db: PrismaClient, ids: string[], status: string, code: string | null) {
  if (!ids.length) return;
  await db.aiJob.updateMany({
    where: { id: { in: ids } },
    data: { status, lastErrorCode: code, lockedAt: null },
  });
}

async function firstAdminUser(db: PrismaClient) {
  return db.user.findFirst({
    where: { role: "admin", ativo: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

async function maybePromoteTriage(db: PrismaClient, input: PersistInput) {
  const conversation = await db.conversation.findFirst({
    where: { id: input.conversationId },
    select: {
      condominiumId: true,
      triageItem: { select: { id: true, status: true } },
    },
  });
  const openTicketCount = await db.ticket.count({
    where: { conversationId: input.conversationId, status: { not: "resolvido" } },
  });
  if (
    !shouldPromoteTriageAsSystem({
      openTicketCount,
      condominiumId: conversation?.condominiumId ?? null,
      triageId: conversation?.triageItem?.id ?? null,
      triagePromoted: conversation?.triageItem?.status === "promovido",
    })
  ) {
    return;
  }
  try {
    const ticket = await ticketService.promoteFromTriageAsSystem(conversation!.triageItem!.id);
    await audit(db, {
      action: "AI_PROMOTED_TRIAGE",
      conversationId: input.conversationId,
      ticketId: ticket.id,
      result: ticket.protocol,
    });
  } catch {
    await audit(db, {
      action: "AI_PROMOTED_TRIAGE",
      conversationId: input.conversationId,
      ticketId: input.ticketId,
      result: "failed",
    });
  }
}

async function audit(
  db: PrismaClient,
  input: {
    action: string;
    conversationId?: string | null;
    ticketId?: string | null;
    jobId?: string | null;
    interactionId?: string | null;
    actorId?: string | null;
    result: string;
  },
) {
  await db.aiAuditEvent.create({
    data: {
      action: input.action,
      conversationId: input.conversationId ?? null,
      ticketId: input.ticketId ?? null,
      jobId: input.jobId ?? null,
      interactionId: input.interactionId ?? null,
      actorId: input.actorId ?? null,
      result: input.result.slice(0, 200),
    },
  });
}

export async function claimQueuedInbound(db: PrismaClient, conversationId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; idempotencyKey: string; payload: unknown; createdAt: Date }>>`
    UPDATE "AiJob"
    SET status = 'running',
        "lockedAt" = NOW(),
        attempts = attempts + 1
    WHERE "conversationId" = CAST(${conversationId} AS uuid)
      AND type = 'ai.inbound'
      AND status = 'queued'
      AND "runAfter" <= NOW()
    RETURNING id, "idempotencyKey", payload, "createdAt"
  `;
  return rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
