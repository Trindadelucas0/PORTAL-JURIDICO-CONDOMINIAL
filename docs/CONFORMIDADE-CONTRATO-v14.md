# Conformidade — Contrato v14 × Sistema Juricon

| Item | Valor |
|------|-------|
| Contrato auditado | Contrato de Prestação de Serviços — Desenvolvimento de Sistema de Gestão Jurídica Condominial sob Medida, **versão 14** |
| Fonte do contrato | `gerar_contrato_portal_juridico.py` na pasta `docs/` do diretório pai (gera `Contrato-Portal-Juridico-v14.docx`); PDF conferido: `Contrato-Portal.pdf` |
| Estado do contrato | **Não assinado** — o fechamento traz "Brasília/DF, ___ de ______________ de 2026" e os campos de assinatura em branco |
| Partes | CONTRATANTE: VINICIO SOCIEDADE INDIVIDUAL DE ADVOCACIA (CNPJ 57.066.424/0001-76) · CONTRATADA: 67.790.913 LUCAS RODRIGUES DA TRINDADE (CNPJ 67.790.913/0001-20) |
| Preço | R$ 1.700,00/mês × 14 meses = R$ 23.800,00 (cláusulas 4.1 e 4.2) |
| Sistema auditado | `PORTAL JURIDICO CONDOMINIAL`, versão **0.12.16**; correção da §3 em **0.12.17** e da §4 em **0.12.18** |
| Histórico do repositório | 23 commits, 14/09/2026 a 14/10/2026 |
| Data da auditoria | 20/10/2026 |
| Método | Varredura do código-fonte: schema Prisma, migrações, rotas `app/api`, telas `app/(app)`, serviços `lib/`, `worker/`, testes, compose e CI. Todo item cita `arquivo:linha` ou declara explicitamente que a varredura não encontrou resultado |

Este documento **não** substitui o [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md) (fonte oficial
de comportamento). Ele compara o que o contrato promete com o que o código faz.

## 1. Resumo

| Situação | Quantidade |
|---|---|
| Módulos do Anexo I entregues | **6 de 7** (01, 02, 03, 04, 06, 07) |
| Módulo contratado ausente | **1** — 05 Prazos |
| Violação de cláusula | **1** — autoenvio da IA (16.1), **corrigida em 0.12.17** |
| Violação de critério de entrega | **1** — "mensagem bruta não vira chamado automaticamente" (módulo 02), **corrigida na 0.12.18** |
| Obrigações contratuais sem lastro no código | **5** — 14.4(a) backup, 16.4 não treinamento, 14.5 incidente, 3.7 relatórios, item 3 "apoio em relatórios" |
| Subsistemas entregues fora do Anexo I | **12 grupos de rota/subsistema** + 5 integrações não nomeadas |
| Exclusões do contrato respeitadas | **6 de 6** |

Leitura curta: a entrega está **muito à frente do cronograma** e com escopo bem maior que o contratado,
mas tem um módulo contratado apagado e um conjunto de obrigações jurídicas (LGPD, IA, relatórios de
acompanhamento) sem implementação ou sem registro.

## 2. Módulos do Anexo I — item por item

### 01 – Atendimento — **Conforme** (6/6)

| Item do Anexo | Situação | Onde está no código |
|---|---|---|
| Recebimento de mensagens pelo WhatsApp do síndico | Conforme | `app/api/webhooks/evolution/route.ts:10-48` (secret com `timingSafeEqual`, teto de 256 KB); parser `lib/channels/evolution-webhook.ts:284-306`; provider `lib/channels/evolution-baileys-provider.ts` |
| Identificação do condomínio e do contato | Conforme | `lib/services/atendimento-service.ts:241` (`findContactByPhones`), `:312-322` (vínculo contato + condomínio), `:264-276`; identidades `prisma/schema.prisma:206-215` |
| Entrada das solicitações no sistema | Conforme | `lib/services/atendimento-service.ts:347-359` (grava `Message`), `:386-401` (cria `TriageItem` só se o contato tem condomínio) |
| Histórico das conversas | Conforme | `lib/services/atendimento-service.ts:688-706` (`listMessages`); UI `components/atendimento/thread-panel.tsx`, `message-bubbles.tsx` |
| Envio de respostas pelo WhatsApp | Conforme | `lib/services/atendimento-service.ts:708-824` (`postMessage`); entrega `lib/services/whatsapp-dispatch.ts:46-129` |
| Envio de documentos e arquivos | Conforme | Anexo no compositor: `components/atendimento/message-composer.tsx:147-155` → `lib/services/whatsapp-dispatch.ts:95-108` → `lib/channels/evolution-baileys-provider.ts:339-375`. Documento do dossiê: `lib/services/document-service.ts:334-369` |

Critério de entrega do Anexo (recebe, identifica, registra, responde com texto **ou** arquivo pelo mesmo
canal): **atendido**. Não há portal do síndico (ver §6) e a mensagem não vira chamado sozinha no primeiro
contato (`tests/escritorio.test.ts:24-56`).

### 02 – Triagem — **Conforme com ressalva** (6/7)

| Item do Anexo | Situação | Onde está no código |
|---|---|---|
| Caixa de entrada sob controle da admin | Conforme | `app/api/triage/route.ts:9` e `app/api/triage/[id]/route.ts:23,35` (`requireAdmin`); tela `app/(app)/triagem/page.tsx` |
| Análise das novas solicitações | Conforme | `lib/services/cadastro-service.ts:581-618` (fila), `:556-579` (detalhe); painel `components/triagem/triage-analysis-panel.tsx:138-227` |
| Classificação das demandas | Conforme | `prisma/schema.prisma:64-71` (`TicketCategory`), `:311`; UI `components/triagem/triage-analysis-panel.tsx:173-182` |
| Definição de prioridade | Conforme | `prisma/schema.prisma:57-62`, `:312`; UI `triage-analysis-panel.tsx:183-192` |
| Definição do responsável | Conforme | `triage-analysis-panel.tsx:193-203`; `lib/services/ticket-service.ts:75-80,314` |
| Transformação da solicitação em chamado | Conforme | `lib/services/ticket-service.ts:281-361` (`promoteFromTriage`: admin-only `:291`, protocolo `:319`, religa mensagens órfãs `:345-348`, auditoria `:351-357`) |
| **Arquivamento e organização das entradas** | **Ressalva** | Arquiva: `components/triagem/triage-analysis-panel.tsx:223-225` → `lib/services/cadastro-service.ts:633-647` (`status: "arquivado"` + auditoria `triage.archive`). Mas **não há tela, filtro nem rota para listar ou desarquivar**: `listTriage` é fixo em `status: "aberto"` (`lib/services/cadastro-service.ts:582-585`) e a rota não repassa filtro (`app/api/triage/route.ts:11`). O item arquivado só reaparece se o cliente mandar nova mensagem (`lib/services/atendimento-service.ts:394-399`) |

Observação: as ações `identify` e `linkCondominium` constam do schema da rota
(`app/api/triage/[id]/route.ts:10-11`) mas são recusadas no serviço com 422
(`lib/services/cadastro-service.ts:630-632,648`) — a identificação ficou em `/nao-vinculados`.

**O critério "mensagem bruta não vira chamado automaticamente" estava violado na 0.12.16 e foi corrigido na 0.12.18 — ver §4.**

### 03 – Chamados — **Conforme** (6/6)

| Item do Anexo | Situação | Onde está no código |
|---|---|---|
| Criação e acompanhamento | Conforme | `prisma/schema.prisma:321-353` (`Ticket`, protocolo único); criação manual admin `lib/services/ticket-service.ts:149-236`; listagem e filtros `:84-117`; detalhe `:119-147` |
| Categorias, prioridades e responsáveis | Conforme | `prisma/schema.prisma:57-71,326-332`; edição `lib/services/ticket-service.ts:238-279` (só admin reatribui `:241-243`); encaminhar `lib/services/atendimento-service.ts:622-667` |
| Histórico e informações do condomínio | Conforme | `prisma/schema.prisma:151-168`; ficha `lib/services/cadastro-service.ts:283-380`; contexto no chamado `components/chamados/ticket-context-rail.tsx:19-52` |
| Documentos relacionados | Conforme | `prisma/schema.prisma:355-392` (`OfficeDocument` com `ticketId`); aba Documentos `app/(app)/chamados/[id]/page.tsx:388-424` |
| Notas internas | Conforme | `prisma/schema.prisma:32-35`; gravação `lib/services/atendimento-service.ts:726-737`; barreira dupla `lib/services/whatsapp-dispatch.ts:56-58,137-139` |
| Controle do andamento | Conforme | `prisma/schema.prisma:50-55,325`; `lib/services/ticket-service.ts:238-279` com auditoria antes/depois `:258-277`; Kanban `components/chamados/kanban-board.tsx` |

### 04 – Gestão da equipe — **Conforme** (5/5)

| Item do Anexo | Situação | Onde está no código |
|---|---|---|
| Acesso individual para os usuários | Conforme | `app/api/auth/login/route.ts:22-44`; bcrypt `lib/auth/session.ts:44-50`; sessão por usuário `prisma/schema.prisma:139-149` (guarda só `tokenHash`) |
| Perfil de admin | Conforme | `prisma/schema.prisma:10-13`; `lib/auth/guards.ts:18-32` (`requireAdmin` / `assertAdmin`) |
| Perfil de funcionário | Conforme | mesmo enum; sub-permissões `prisma/schema.prisma:124-125` (`podeResponderCliente`, `apenasRascunho`) |
| Distribuição de chamados | Conforme | `Ticket.assignedToId` `prisma/schema.prisma:130`; atribuição `lib/services/ticket-service.ts:155,221,314`; carga por usuário `lib/services/team-service.ts:53-63` |
| Controle de acesso conforme a responsabilidade | Conforme | `lib/auth/ticket-access.ts:13-29` (`requireTicketAccess`, `ticketListWhere`); escopo de conversa `lib/services/whatsapp-dispatch.ts:34-44`; proteção do último admin `lib/services/team-service.ts:101-115` |

Exclusões do próprio Anexo respeitadas: **sem SSO corporativo e sem Active Directory** — varredura por
`sso|ldap|saml|oauth|azure-ad|next-auth|keycloak|openid` em `app lib components worker scripts tests
prisma package.json` **sem nenhum resultado**.

### 05 – Prazos — **AUSENTE (contratado e não entregue)**

| Item do Anexo | Situação |
|---|---|
| Controle de prazo de atendimento | **Ausente** |
| Controle de prazos relacionados às demandas jurídicas | **Ausente** |
| Acompanhamento das atividades pendentes | **Ausente como especificado.** Existe apenas a faixa **Atenção** da Visão, por contagem e **sem nenhuma dimensão de tempo** (`app/(app)/page.tsx:118-144`, alimentada por `lib/services/atendimento-service.ts:841-853,899-940`) |
| Alerta visível no sistema sobre prazo próximo ou vencido | **Ausente** |

Prova da remoção: `prisma/migrations/20261002120000_drop_deadline/migration.sql:1-2` —
`DROP TABLE IF EXISTS "Deadline";` e `DROP TYPE IF EXISTS "DeadlineKind";` (02/10/2026, versão 0.11.41).
O modelo havia sido criado em `prisma/migrations/20260914183000_escritorio/migration.sql:17,58-69,108`.

Hoje não existem: modelo `Deadline` nem enum `DeadlineKind` no `prisma/schema.prisma`; rota
`app/api/deadlines`; tela `app/(app)/prazos`. Varredura por
`prazo|deadline|dueAt|vencimento|sla|overdue|atrasad|alerta` em `prisma/schema.prisma`, `app/`, `lib/` e
`components/`: **nenhum mecanismo**. Os poucos resultados textuais são variáveis locais de timeout de
socket (`lib/channels/evolution-baileys-provider.ts:169-170,417-418`), um `placeholder` de formulário
(`components/documentos/system-document-ficha-form.tsx:118`) e strings de teste.

O `DOCUMENTACAO-SISTEMA.md:55` e `:369-371` registram a remoção — a documentação do sistema está correta;
é o **contrato** que ficou desalinhado: o módulo 05 segue no item 2 do Anexo I, no cronograma
("Meses 8 a 12: Documentos; Prazos") e na ordem dos módulos (posição 7).

Impacto indireto: "controle de prazo de atendimento" era o único apoio no sistema para acompanhar os
prazos de correção da **cláusula 17.5** (crítica 2 dias úteis, alta 5, média 10, baixa 15). Sem o módulo,
esse controle passa a ser manual.

### 06 – Documentos — **Conforme** (3/3)

| Item do Anexo | Situação | Onde está no código |
|---|---|---|
| Armazenamento de documentos dos atendimentos | Conforme | `prisma/schema.prisma:355-392` (`OfficeDocument`: `ticketId`, `sha256`, versão, vigência); `lib/storage/local-disk.ts`; allowlist de MIME `lib/storage/provider.ts`; antivírus `lib/security/clamav-scan.ts` |
| Anexos nos chamados | Conforme | `prisma/schema.prisma:294-304` (`MessageAttachment`); saída `lib/services/atendimento-service.ts:774-776,802-814`; entrada `worker/download-inbound-media.ts:29-37` |
| Envio de documentos pelo WhatsApp | Conforme | `lib/services/document-service.ts:334-369` (exige `clientSendable`, chamado vinculado e contato identificado) → `dispatchToWhatsApp` |

Conforme também ao que o critério exclui: não é GED completo, não há OCR jurídico obrigatório nem guarda
com valor de cartório.

### 07 – Comunicação interna — **Conforme** (4/4)

| Item do Anexo | Situação | Onde está no código |
|---|---|---|
| Notas internas | Conforme | `lib/services/atendimento-service.ts:726-738`; nunca chega ao provider: `lib/services/whatsapp-dispatch.ts:56-58,137-139` |
| Rascunhos | Conforme | `prisma/schema.prisma:41` (`SendStatus.draft`); rascunho de funcionário `lib/services/atendimento-service.ts:778-799`; rascunho de IA `lib/ai/process-conversation.ts:785-794` |
| Aprovação de respostas pela admin | Conforme | `lib/services/approval-service.ts:51-53` — 403 "Somente a administradora aprova rascunho"; rascunho de IA `lib/ai/copilot-draft.ts:59` |
| Histórico das interações da equipe | Conforme | `prisma/schema.prisma:435-449` (`AuditEvent`) e `:670-688` (`AiAuditEvent`); leitura admin `app/api/audit/route.ts:9` |

### Item 3 – Apoio de inteligência artificial — **Parcial**

| Item do Anexo | Situação | Onde está no código |
|---|---|---|
| Resumo de conversas para agilizar a leitura do chamado | Conforme | `app/api/conversations/[id]/ai-summary/route.ts:9-25`, `app/api/tickets/[id]/ai-summary/route.ts:9-26`; `prisma/schema.prisma:568` (`AiInteraction`), `:594` (`AiCitation`) |
| Consulta a documentos | Conforme | RAG em pgvector: `prisma/schema.prisma:504-526` (`DocumentChunk`, `vector(1536)`), `lib/ai/retriever.ts:153,181`, `lib/ai/citations.ts`, `lib/ai/rag-eligibility.ts` |
| **Apoio em relatórios** | **Ausente** | Varredura por `relatorio\|relatório\|report\|csv\|xlsx\|exportar\|export[A-Z]\|pdfkit\|puppeteer\|jspdf\|pdf-lib` em `app lib components worker scripts package.json`: **nenhum resultado**. Não há tela de relatório, rota de exportação nem geração de CSV/PDF. `pdfjs-dist` só **lê** texto de upload (`lib/ai/extract-pdf.ts`). KPI ao vivo (`app/api/dashboard/route.ts:9`) e métrica de operação (`app/api/metrics/route.ts`) não são relatórios. **Previsto para os meses 12 a 14; ainda não vencido** |
| **Regra obrigatória: tudo sai como rascunho; a admin aprova antes de qualquer envio no WhatsApp** | **Violada na 0.12.16 — corrigida na 0.12.17** | ver §3 |
| Custo de IA por conta da CONTRATANTE | Conforme | nenhuma cobrança embutida no sistema; medição e teto em `prisma/schema.prisma:568-593` e `app/api/ai/usage/route.ts` |
| Dados e documentos não usados para treinamento | **Não implementado** | ver §5, cláusula 16.4 |

## 3. Violação de cláusula — autoenvio da IA (16.1 e Anexo I item 3)

**O que o contrato exige.** Cláusula 16.1: "Conteúdos gerados por IA saem exclusivamente como rascunho e
somente podem ser enviados ao WhatsApp após aprovação humana da CONTRATANTE (admin/sócia)." Anexo I item
3: "Regra obrigatória: tudo sai como rascunho; a admin aprova antes de qualquer envio no WhatsApp." A
cláusula 16.6 condiciona até a troca de provedor à permanência dessa regra.

**O que o sistema fazia na 0.12.16.** A coleta automática (introduzida na 0.12.0, 08/10/2026) enviava
sozinha:

- `lib/ai/intake-runtime.ts:104-126` — `sendAutomated` criava `Message` `visibility:"publica"`,
  `sendStatus:"pending"` (não `"draft"`) e chamava `deliverStoredPublicMessage` direto.
- Seis pontos de chamada. Dois carregavam **texto do modelo**: `sendQuestion` e `sendAnswer`, vindos de
  `parsed.question` / `parsed.clientDraft` (`lib/ai/process-conversation.ts:596-597`). Os outros quatro
  levavam frases fixas (`IMAGE_HANDOFF_TEXT`, `UNCLEAR_REPEAT_TEXT`, `UNCLEAR_ESCALATE_TEXT`,
  `INTAKE_NUDGE_TEXT`, em `lib/ai/intake-cycle.ts:8-13`) — também sem aprovação, e o Anexo I diz "tudo".
- `suppressDraft: true` (`lib/ai/intake-cycle.ts:120,213`, lido em `lib/ai/process-conversation.ts:620`)
  fazia com que **nem rascunho ficasse** para a admin revisar.
- Não passava por `dispatchToWhatsApp`: sem `assertConversationAccess`, sem `canSendPublicWhatsApp`, sem
  ator e **sem `AuditEvent`** (compare `lib/services/whatsapp-dispatch.ts:131-169`).
- Contornava o interruptor que o próprio código criou para esta cláusula:
  `isAiWhatsappSendEnabled()` é `return false` com o comentário "Sempre desligado (contrato v14); a env
  não liga" (`lib/ai/flags.ts:18-21`), consultado **só** por `lib/ai/auto-actions.ts:9` — caminho que o
  `return false` tornou inalcançável.
- Estava **ativo**: o `.env` local tem `AI_ENABLED=true`.

**Correção aplicada na 0.12.17.** `sendAutomated` passou a consultar `isAiWhatsappSendEnabled()`. Com ela
desligada (sempre, hoje), a frase nasce `Message` pública `sendStatus=draft` e **não** vai ao canal; quem
despacha é `POST /api/messages/:id/approve` → `lib/services/approval-service.ts:51-53`, que exige
`isAdmin`. O retorno virou `{ id, outcome }` (`sent` / `draft` / `failed`) para a sessão da coleta avançar
com rascunho e reverter só em falha real. O dedupe da própria coleta passou a contar `sent` **ou**
`draft`, para não empilhar rascunho igual a cada turno; a detecção da resposta pública **humana** que
interrompe a coleta continua só em `sent`, porque rascunho humano não chegou ao cliente. A auditoria
(`AI_QUESTION_SENT`, `AI_INTAKE_NUDGE`) passou a gravar o desfecho real. Testes:
`tests/ai-intake-cycle.test.ts` — o lembrete fica `draft` e a env não liga o autoenvio.

**Observação correlata, fora do alcance da 16.1.** `lib/services/automation-service.ts:189-197` (saudação
"primeira mensagem do dia") também envia sem aprovação, mas o texto é **escrito pela admin**
(`AutomationRule.body`, `prisma/schema.prisma:456`), a regra nasce inativa e o CRUD é admin-only
(`app/api/automations/route.ts:8`). Não é conteúdo gerado por IA — ainda assim, convém que a CONTRATANTE
saiba que essa regra dispara envio automático.

## 4. Violação de critério de entrega — chamado criado sem triagem (módulo 02) — **corrigida na 0.12.18**

O Anexo I, na "Regra de ouro do produto" e no critério do módulo 02, diz: "Mensagem bruta não vira chamado
automaticamente — passa pela triagem da admin/sócia." O fluxo da primeira mensagem respeita isso
(`lib/services/atendimento-service.ts:324-345`; `tests/escritorio.test.ts:24-56` afirma
`ingest.ticketCreated === false`). Três caminhos, porém, criam `Ticket` sem passar pela triagem:

| Caminho | Gate | Condição |
|---|---|---|
| `openAfterResolved` — `lib/services/ticket-service.ts:375-459`, chamado dentro do próprio ingest em `lib/services/atendimento-service.ts:333-344` | **nenhum** | inbound numa conversa cujo último chamado está `resolvido` e sem chamado aberto → cria `Ticket` (`outro` / `media` / sem responsável) e grava o `TriageItem` já como `promovido` (`:425-445`). Documentado em `tests/escritorio.test.ts:92` e na regra 1 do `DOCUMENTACAO-SISTEMA.md` |
| `applyImagePriority` — `lib/services/ticket-service.ts:511-541`, de `lib/ai/intake-runtime.ts:519` | `AI_ENABLED` | cliente manda imagem durante a coleta → `promoteFromTriage` com prioridade alta (`:534-537`) |
| `prioritizeUnclearIntake` — `lib/services/ticket-service.ts:462-508`, de `lib/ai/intake-runtime.ts:680` | `AI_ENABLED` | segunda resposta incompreensível na coleta → `promoteFromTriage` com prioridade alta (`:496-505`) |

Nenhum dos três consulta `isAiCreateTicketEnabled()` — o interruptor que o resto do código usa para
garantir essa regra (`lib/ai/flags.ts:23-26`, travado por `tests/ai-operational.test.ts:810-834`, que
mantém inalcançável o caminho `promoteFromTriageAsSystem`).

**Correção (0.12.18).** Os três caminhos deixaram de criar chamado. (A) `openAfterResolved` foi removido; a mensagem de quem já teve chamado resolvido volta para a triagem como `aberto`, sem `ticketId`, e a admin cria o chamado novo. (B) foto na coleta e (C) segunda não-compreensão passaram a subir a prioridade da triagem para `alta`, sem promover. Os dois textos ao cliente que falavam em “chamado” foram trocados. Testes: `tests/escritorio.test.ts` (volta para a triagem, admin cria) e `tests/ai-intake-cycle.test.ts`. A descrição acima é o estado da 0.12.16, que motivou a correção.

## 5. Obrigações contratuais sem lastro no código

| Cláusula | Obrigação | Situação |
|---|---|---|
| **14.4(a)** | "configuração de cópia de segurança periódica do banco de dados e dos arquivos do sistema … com retenção definida em conjunto" | **Parcial.** `infra/deploy/backup.sh:14-23` cobre os dois bancos e os uploads, documentado em `docs/backup-nota.md`. Mas **o agendamento não existe no repositório**: nenhum crontab, systemd timer, serviço de cron no `docker-compose.yml` / `docker-compose.prod.yml`, entrada no `ecosystem.config.cjs` ou no `.github/workflows/ci.yml`. O `docs/deploy-vps.md:135` só instrui "cron diário no host". Também não há política de retenção/rotação dos dumps nem cópia fora do servidor. Periodicidade e retenção, se existem, são estado de host não versionado. Em contrapartida, a retenção **de aplicação** é automática: `lib/ai/retention.ts:1-2,12-28` (auditoria 180 dias, memória rejeitada 30), enfileirada diariamente em `worker/index.ts:26-37` |
| **16.4** | "A CONTRATADA configurará a API de modelos de IA de terceiro, quando o provedor oferecer essa opção, para que tais dados não sejam utilizados para treinamento" | **Não implementado.** Varredura por `no_train\|do-not-train\|opt.?out\|zdr\|zero.?data.?retention\|data_retention\|store:\|training` em `lib/ app/ worker/ docs/ infra/`, nos dois compose e no `.env.example`: **nenhum resultado**. Os únicos cabeçalhos enviados ao provedor são `Authorization` e `Content-Type` (`lib/ai/provider.ts:196-203` no chat, `:234-241` no embed), e o corpo leva só `model`, `temperature`, `max_tokens` e `messages`. Dados pessoais no prompt (mensagens do morador, fatos de `AiContactMemory`, trechos de documento do condomínio) seguem sob os termos **padrão** do provedor. **Agravante:** o failover pode mandar os mesmos dados a um **segundo** provedor (Gemini por padrão, `lib/ai/provider.ts:90-91`, acionado em `:117-120`), também sem opt-out e sem registro de qual provedor processou cada interação — e esse segundo provedor não é nomeado no Anexo I |
| **14.5** | comunicar incidente de segurança em até 2 dias úteis | **Sem lastro.** Varredura por `incidente\|incident\|breach\|vazamento\|security.?event\|LOGIN_FAIL`: **nenhum resultado**. Não há registro de incidente nem procedimento documentado. **Login falho não é auditado**: `app/api/auth/login/route.ts:35-37` devolve 401 sem `writeAudit`, então tentativa de força bruta não deixa rastro persistente — só o rate limit em memória de `lib/api/rate-limit.ts`, que é por processo e não sobrevive a restart |
| **3.7** + Anexo I item 8 | relatórios de acompanhamento por escrito, 2×/semana nos primeiros 40 dias e 1×/semana depois, com 10 campos mínimos | **Sem lastro no repositório.** Nenhum artefato de relatório de acompanhamento. Se estão sendo enviados por e-mail ou WhatsApp, não há cópia versionada — o que enfraquece a prova de cumprimento, já que a cláusula 3.8 faz o silêncio da CONTRATANTE em 5 dias úteis valer como ausência de apontamento novo |
| Anexo I item 3 | "Apoio em relatórios" | **Ausente** (ver §2). Previsto para os meses 12 a 14 — ainda no prazo |

## 6. Exclusões do contrato — todas respeitadas

| Item "expressamente fora do escopo" | Verificação |
|---|---|
| Portal ou aplicativo do síndico | **Não existe.** Nenhuma rota `/sindico`; login único contra a tabela `User`, restrita a `admin` / `funcionario` (`prisma/schema.prisma:10-13`, `app/api/auth/login/route.ts:31-37`); deny-by-default em `proxy.ts:41-58`. O próprio metadado declara: `app/layout.tsx:22` — "O síndico não opera neste sistema." O síndico aparece só como **dado** (papel de contato) |
| Aplicativo nas lojas (iOS/Android nativo) | **Não existe.** Sem `capacitor`, `electron`, `react-native`, `expo`, `cordova` ou `tauri` em `package.json:28-77`. Entrega web; mobile é responsivo (`hooks/use-mobile.ts`) |
| FAQ público ou pesquisa de satisfação | **Não existe.** Varredura por `faq\|nps\|survey\|satisfação\|csat`: nenhum resultado |
| Sistema multi-escritório (SaaS para vários escritórios) | **Não existe.** Varredura por `companyId\|tenantId\|organizationId\|orgId\|escritorioId\|officeId\|workspaceId` nas 688 linhas do `prisma/schema.prisma`: **nenhum resultado**. Single-tenant real; o único eixo de escopo é `Condominium` — cliente do escritório, não inquilino de SaaS |
| Redes sociais e integração com processo eletrônico | **Não existe.** Varredura por `pje\|projudi\|e-saj\|tribunal\|jusbrasil\|scraping\|puppeteer\|playwright\|cheerio\|instagram\|facebook\|linkedin\|twitter\|tiktok`: nenhum resultado |
| Qualquer funcionalidade que obrigue o síndico a sair do WhatsApp | **Não existe, e há barreira ativa.** Nenhum link de portal sai ao contato; `lib/ai/public-reply-guard.ts:40-55` reprova rascunho que afirma ação não executada ("o síndico foi avisado") e `:62-64` o que manda o morador falar com o vizinho; o prompt reforça em `lib/ai/prompts/inbound-v3.ts:29` |

Cláusula 2.3 (referência ao portal de terceiro, sem cópia de código, identidade visual ou arquitetura):
varredura por `avadesk` em `*.ts`, `*.tsx`, `*.json` e `*.md` do projeto — **nenhum resultado** fora de
anotações de treino em `docs/iatreino.txt`. Nada indica cópia.

## 7. O que foi entregue a mais (fora do Anexo I)

O Anexo I lista 7 módulos + Apoio de IA. Está no sistema, além disso:

| Subsistema | Onde |
|---|---|
| `/nao-vinculados` — fila de identidade para número desconhecido | `app/(app)/nao-vinculados/page.tsx`; `prisma/schema.prisma:206-216` (`ContactIdentity`) |
| `/condominios` e `/condominios/[id]` — CRUD cadastral de condomínio e contatos, participação em vários condomínios | `lib/services/cadastro-service.ts:283-407`; `prisma/schema.prisma:151-168,193-205` |
| Regra de IA por condomínio | `prisma/schema.prisma:492-503` (`AiCondominiumRule`); `app/api/condominiums/[id]/ai-rule/route.ts` |
| `/conexoes` — administração da sessão WhatsApp (QR, estado vivo, desconectar) | `app/api/connections/*`; `prisma/schema.prisma:217-226` |
| `/mensagens-automaticas` — regra de saudação automática com histórico de execuções | `prisma/schema.prisma:106-115,451-468`; `lib/services/automation-service.ts` |
| `/documentos-sistema` — **segunda** biblioteca documental (do escritório, não do condomínio), com campos voltados à busca da IA e indexação própria | `prisma/schema.prisma:394-422`; `lib/services/system-document-service.ts`; `worker/ingest-document.ts` |
| `/` Visão — KPIs operacionais ao vivo, faixa Atenção e tabela Minha operação | `app/(app)/page.tsx`; `lib/services/atendimento-service.ts:826-941` |
| Auditoria — `AuditEvent` + `AiAuditEvent`, cerca de 60 ações, com remoção de segredos | `prisma/schema.prisma:435-449,670-688`; `lib/services/audit-service.ts:6-40`; `app/api/audit/route.ts` |
| Observabilidade — Prometheus com Bearer e sondas de saúde | `app/api/metrics/route.ts:7-30`; `app/api/health/`, `app/api/health/ai/route.ts` |
| Memória de IA — fatos sobre o contato e memória do chamado com revisões | `prisma/schema.prisma:657-668,609-656`; `app/api/contacts/[id]/ai-memory/route.ts` |
| RAG completo em pgvector — chunking, embeddings, índice HNSW, citações, vigência e scripts de calibração/reindexação | `prisma/schema.prisma:504-527`; `prisma/migrations/20260925160000_ai_operational/migration.sql:4,19,132`; `lib/ai/retriever.ts`, `lib/ai/chunks.ts`, `lib/ai/citations.ts` |
| Coleta automática da IA — sessão de perguntas pelo WhatsApp (desde a 0.12.17, em rascunho; ver §3) | `prisma/schema.prisma:529-547`; `lib/ai/intake-runtime.ts`, `lib/ai/intake-cycle.ts` |
| Fila de jobs e worker — `AiJob` com idempotência e retomada, BullMQ/Redis como broker, expurgo diário | `prisma/schema.prisma:548-567`; `worker/index.ts:18-70`; `lib/ai/retention.ts` |

Integrações de terceiros **não nomeadas** no Anexo I (que fala de WhatsApp e IA, e manda orçamento
adicional para "integrações com terceiros não listadas neste Anexo"):

| Integração | Onde | Observação |
|---|---|---|
| Provedor de IA de apoio (Gemini por padrão) | `lib/ai/provider.ts:90-106,117-120` | segundo subprocessador de dados pessoais; ver 16.4 em §5 |
| Provedor de embeddings | `lib/ai/provider.ts:223-241` | sustenta o RAG |
| ClamAV (antivírus de upload) | `lib/security/clamav-scan.ts:28,47-49` | opcional (`CLAMAV_URL`); endurecimento de segurança |
| Redis / BullMQ | `lib/ai/queue.ts:55-56`; `docker-compose.yml:87-99` | infraestrutura de fila |
| Prometheus | `app/api/metrics/route.ts` | expõe métrica, não consome serviço |

Não há integração de CEP, CNPJ, e-mail/SMTP, SMS, meio de pagamento ou armazenamento em nuvem: o CNPJ é
campo digitado com validação de 14 dígitos (`lib/services/cadastro-service.ts:21-30`) e os arquivos vão
para disco local (`lib/storage/local-disk.ts`).

**Enquadramento contratual.** As cláusulas 2.5, 8.3 e 10.4 permitem à CONTRATADA incorporar melhorias sem
custo adicional, e a 10.6 garante que fazê-lo uma vez **não** cria obrigação futura de mesma natureza.
O excedente acima é, portanto, legítimo e não gera direito adquirido. Vale registrar por escrito à
CONTRATANTE que esses itens foram entregues sem orçamento adicional.

## 8. Cronograma

| Etapa do Anexo I (item 7) | Previsto | Situação em 20/10/2026 |
|---|---|---|
| Até 40 dias: ambiente de testes + primeiro recorte de Atendimento | — | Muito além do recorte mínimo exigido |
| Meses 1 a 4: Atendimento + identificação, Triagem, Chamados + ficha do condomínio | meses 1–4 | **Entregue** |
| Meses 4 a 8: Gestão da equipe e permissões; Comunicação interna e aprovações | meses 4–8 | **Entregue** |
| Meses 8 a 12: Documentos; Prazos | meses 8–12 | Documentos **entregue**; Prazos **removido** |
| Meses 12 a 14: Apoio de IA (rascunhos) e ajustes | meses 12–14 | Resumo e consulta a documentos **entregues**; "apoio em relatórios" **ausente** |

O repositório tem 23 commits entre 14/09/2026 e 14/10/2026 — cerca de um mês de desenvolvimento para o
que o contrato distribui em 14 meses. Não há atraso de cronograma; o desalinhamento é de **conteúdo**
(Prazos), não de prazo.

## 9. Pontos a tratar com a CONTRATANTE antes da assinatura

1. **Módulo 05 – Prazos.** O contrato o promete e o sistema não o tem. Como o contrato ainda não está
   assinado, as saídas são: retirar o módulo do Anexo I (e do cronograma e da ordem dos módulos), ou
   mantê-lo e reimplementar dentro dos meses 8 a 12. Decidir antes de assinar evita discussão de
   inadimplemento depois. Lembrar que ele também era o único apoio no sistema aos prazos da cláusula 17.5.
2. **Segundo provedor de IA e cláusula 16.4.** Hoje não há configuração de não treinamento em nenhum dos
   dois provedores, e o failover envia os mesmos dados pessoais a um provedor que o Anexo I não nomeia.
   Duas providências: configurar o opt-out na conta de cada provedor (e registrar onde isso foi feito) e
   nomear o provedor de apoio no Anexo I ou avisar por escrito, como a própria cláusula 16.5 prevê.
3. **Relatórios de acompanhamento (3.7 e Anexo I item 8).** Definir onde ficam arquivados, com os 10
   campos mínimos. Sem cópia guardada, a CONTRATADA perde a prova de cumprimento e o efeito do silêncio
   de 5 dias úteis da cláusula 3.8.
4. **Backup periódico e retenção (14.4a).** Deixar o agendamento e a retenção versionados no repositório,
   não só como instrução de host, e definir a retenção "em conjunto", como a cláusula exige.
5. **Chamado criado sem triagem (§4).** Decidir entre corrigir os três caminhos ou ajustar o critério do
   módulo 02.
