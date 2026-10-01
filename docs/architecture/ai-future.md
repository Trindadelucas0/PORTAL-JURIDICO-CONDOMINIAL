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
- JSON inválido: `completeValidJson` tenta de novo uma vez. A segunda chamada não repete o pacote: se a saída tiver `{`, o `user` ganha `<INVALID_OUTPUT>` (trecho a partir da chave, até 1500 caracteres, sem `<think>`) e o erro de sintaxe ou do schema; senão só o erro. HTTP/timeout na segunda volta não mata o job (`ok: false`). Se as duas falharem, a frase de revisão humana fica em `summary.analise`, `pendencias` traz o `reason` curto e a faixa **Análise interrompida** usa `motivoEscalonamento=json_invalido`. **Gerar resumo** nas mesmas mensagens depois desse motivo grava de novo. Não há rascunho público nem `respostaSugerida`. Approve e Enviar ao cliente recusam esse texto.
- `clientDraft` passa por `gateClientDraft` antes de virar rascunho. Linguagem operacional interna ou cópia longa de `summary.analise` vira `human_review` sem `Message` e sem autoenvio, mesmo com `AI_WHATSAPP_SEND_ENABLED=true`. A barreira não fica no provider.
- Antes disso, `revisarRespostaPublica` (`lib/ai/public-reply-guard.ts`) reprova `clientDraft` que copia as faixas de horário sem o morador perguntar, afirma ação não executada ou fala de sistema/IA; uma regeneração com `PUBLIC_REPLY_REWRITE` e, se continuar reprovado, `human_review` com `motivoEscalonamento=resposta_publica`. Prompt padrão `inbound-v3`.
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

## Raciocínio e troca para a API da OpenAI

Isto é o que o código faz hoje. Não liga raciocínio no Nemotron nem na OpenAI.

- O chat corrente é NVIDIA. `postChat` (`lib/ai/provider.ts`) manda `model`, `temperature: 0`, `max_tokens` (1200 fixo nas três chamadas de `completeValidJson` em `process-conversation.ts`) e `messages`. `reasoning_effort: "none"` só sai de `gemini25ReasoningOff`, no apoio Gemini 2.5. O Nemotron não recebe esse campo.
- `AI_MAX_OUTPUT_TOKENS_PER_INTERACTION` está no `.env.example` e nenhum TypeScript lê essa variável. Mudar o `.env` não altera o teto.
- A geração para quando acaba `max_tokens`. Se o modelo gasta essa cota raciocinando, o JSON que `parseModelJson` lê pode sair cortado. A segunda chamada com `<INVALID_OUTPUT>` não aumenta o teto.
- `resolveAiBaseUrl`: `AI_PROVIDER=openai` usa `https://api.openai.com/v1` e ignora `AI_API_BASE_URL`. `postChat` continua lendo só `choices[0].message.content`.
- No dia da OpenAI, antes de trocar `AI_MODEL_MAIN`: conferir na documentação da OpenAI daquele modelo se o corpo aceita `max_tokens` ou outro nome, e se tokens de raciocínio entram na mesma cota. O único gancho atual é o `if` de `gemini25ReasoningOff` em `postChat`. Não ligar raciocínio da OpenAI neste arquivo antes dessa troca. Embed (`AI_MODEL_EMBED`, 1536) não muda com o chat.

## Fora desta entrega

- Loop de ferramentas do LLM.
- Mudar `vector(1536)`.
- Reescrever `lib/ai/prompts/inbound-v1.ts`.

Desenho e limites: `DOCUMENTACAO-SISTEMA.md` regra 18 e §6.4.
