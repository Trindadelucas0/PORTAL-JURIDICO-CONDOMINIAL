# IA operacional

A camada existe no código e fica **desligada** enquanto `AI_ENABLED` não for `true`. Sem a flag, o webhook só grava a mensagem (e pode enfileirar download de mídia), como antes.

## O que o código faz

- Depois de `ingestInbound` com `created` e contato no fluxo (`condominiumId`), grava `AiJob` `ai.inbound` e tenta acordar a fila. Duplicata de `waMessageId` não enfileira. Número sem condomínio não entra. Falha de Redis não muda o 200.
- O `POST /api/webhooks/evolution` não chama o modelo. Caption segue no texto. `mediaHint` (mimetype/fileName) pode criar `ai.media.download`.
- Worker (`pnpm worker`, container `juricon-worker`, ou no `next dev` o `register` de `instrumentation.ts` quando `isAiEnabled()`) resolve o condomínio no banco. `NODE_ENV=production` não chama esse `register`. O job `queued` é reivindicado com `UPDATE` em `AiJob`.
- Com `AI_RAG_ENABLED=true`, busca chunks por `embedding <=>` só daquele `condominiumId`, `corpus=condominium` e `OfficeDocument.ragEnabled=true` (vigência e não substituído). Documento novo nasce com `ragEnabled=true`, menos áudio. Sem limite de trechos: todo chunk vigente entra, ordenado por distância, com o texto inteiro, até 24000 caracteres no pacote. Embed ≠ 1536 é ignorado.
- O system prompt padrão é `INBOUND_V2_SYSTEM`. `INBOUND_V1_SYSTEM` não foi reescrito.
- Mensagem, memória, fatos **accepted**, regra do condomínio e trecho vão em `<MESSAGE_DATA>`, `<MEMORY_DATA>`, `<CONTACT_DATA>`, `<CONDOMINIUM_RULE_DATA>` e `<DOCUMENT_DATA>`.
- `GET /api/ai/queue` (admin) devolve a fila; `POST /api/tickets/:id/ai/retry` (admin) devolve job `failed`/`dead` para `queued`. Nenhum dos dois tem tela. A aba Caso do chamado mostra o bloco **Análise interna**.
- JSON inválido: uma segunda chamada; se falhar, a frase de revisão humana fica em `summary.analise`. Não há rascunho público nem `respostaSugerida`. Approve e Enviar ao cliente recusam esse texto.
- `clientDraft` passa por `gateClientDraft` antes de virar rascunho. Linguagem operacional interna ou cópia longa de `summary.analise` vira `human_review` sem `Message` e sem autoenvio, mesmo com `AI_WHATSAPP_SEND_ENABLED=true`. A barreira não fica no provider.
- Envio humano continua em `POST /api/messages/:id/approve`. Documento: `POST /api/documents/:id/send-draft` só se `clientSendable`.
- Copiloto na ficha `/chamados/[id]` e no cabeçalho de `/atendimento`: **Resumo IA** e **Rodar IA** (`POST .../ai-run`). A chave do job manual não é id de mensagem; o worker lê as últimas 20 inbound. Sem revisão o sheet mostra texto, não cinco barras. **Auditoria** com tokens hoje neste chamado. Não vinculados não tem os botões.
- `GET /api/health/ai` (admin): `queued`, `running`, `failed24h`, `tokensToday`, `circuitOpen`, flags booleanas.
- `GET /api/metrics`: Prometheus se `Authorization: Bearer` igual a `METRICS_TOKEN`; token vazio → 404.
- Purge diário (`ai.retention.purge`): auditoria 180 dias; memória de contato `rejected` 30 dias.
- `juricon-redis` é broker de job. Postgres de produção: `pgvector/pgvector:pg16`.

## Flags perigosas (nascem desligadas)

- `AI_WHATSAPP_SEND_ENABLED=true` faz o persist chamar `dispatchToWhatsApp` depois do draft, com user admin do banco. Injeção e fallback de servidor **não** disparam esse caminho. O action-gate **não** ganha SEND.
- `AI_CREATE_TICKET_ENABLED=true` promove triagem como categoria `outro` se não houver ticket aberto e houver `condominiumId`. O modelo não escolhe o enum.

Não ligue essas duas no `.env` do notebook nem em produção sem revisão explícita.

## Fora desta entrega

- Loop de ferramentas do LLM.
- Mudar `vector(1536)`.
- Reescrever `lib/ai/prompts/inbound-v1.ts`.

Desenho e limites: `DOCUMENTACAO-SISTEMA.md` regra 18 e §6.4.
