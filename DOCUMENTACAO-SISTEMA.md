# Juricon — Documentação do Sistema

| Item | Valor |
|------|--------|
| Versão do sistema | 0.6.0 — CRM de controle |
| Última atualização | 18/09/2026 (paleta neutra, kanban com cores de status, documentos por condomínio, Prazos fora da UI) |
| Fonte oficial | Este arquivo |
| Repositório | pasta `PORTAL JURIDICO CONDOMINIAL` (GitHub PORTAL-JURIDICO-CONDOMINIAL) |

## 1. Como usar este documento

Fonte única de comportamento. Não descreve o protótipo da pasta pai (`condominio-advogada`) nem o questionário `perguntas/`.

## 2. Tecnologias utilizadas

- Next.js 16 (App Router) + React + TypeScript
- Tailwind CSS 4 + shadcn **base-nova** + ReUI Free (`Frame`, `IconTile`, `Alert`, `Kanban`, `Timeline`, `Stepper`; sidebar shadcn)
- Prisma 6 + PostgreSQL (database `"PORTAL-JURIDICO"`)
- Zod, TanStack Query, bcryptjs
- Testes: Vitest
- WhatsApp: `WhatsAppProvider` (DevMock e Evolution Baileys). Compose Redis + Evolution **separado** do Postgres do app
- Sem NestJS, sem LLM/pgvector, sem tabela `DocumentChunk`

Justificativa Route Handlers: um cliente (o próprio App Router); domínio e API no mesmo app.

### 2.1 Histórico de versões

| Versão | Data | Nome | O que mudou |
|--------|------|------|-------------|
| 0.1.0 | 14/09/2026 | Fase 0 escritório | Scaffold, auth, cadastros, inbox, triagem, conexões DevMock/Evolution |
| 0.2.0 | 14/09/2026 | Escritório operacional | Ticket, equipe POST/PATCH, promover triagem, documentos, prazos, rascunho/aprovação, Docker Evolution |
| 0.2.1 | 14/09/2026 | Controle WhatsApp Web | `/conexoes` status live + ensure instance + QR imagem + disconnect; compose `evoapicloud/evolution-api:v2.2.3` |
| 0.2.2 | 14/09/2026 | Webhook secret | Evolution envia `x-evolution-secret`; sem header o app responde 401 fail-closed |
| 0.2.3 | 14/09/2026 | Sem webhook global | `WEBHOOK_GLOBAL_ENABLED=false`; fila Redis Evolution limpa; só instância com secret |
| 0.2.4 | 14/09/2026 | QR WhatsApp Web | `CONFIG_SESSION_PHONE_VERSION=2.3000.x` (não Chrome 22.5.0); cache `QRCODE_UPDATED`; sem delete/restart em loop |
| 0.2.5 | 14/09/2026 | QR WSL | Patch `os.release`; VERSION Baileys `2.3000.1043857760` (não a da imagem); poll `/instance/connect` |
| 0.2.6 | 14/09/2026 | Envio 422 | POST mensagens consulta `connectionState`; 422 com causa Evolution; inbox distingue DevMock vs WhatsApp Web |
| 0.2.7 | 15/09/2026 | Webhook Evolution 200 | Payload v2 (array/`null`/`@lid`) não gera 422; ignored=200; rate limit 429 só no ingest; sendText retry `textMessage`; logout 400=close |
| 0.2.8 | 15/09/2026 | Deploy VPS | Compose prod (Next + Postgres Juricon); Evolution sem porta pública; webhook Docker; CSRF `APP_PUBLIC_URL`; rate limit `CF-Connecting-IP`; guia `docs/deploy-vps.md` |
| 0.2.9 | 15/09/2026 | Conexões QR | `/conexoes` cartão principal (Conectado/Desconectado); **Conectar** mostra QR; poll `/status` com o painel aberto; mock/Cloud/extras em Desenvolvimento |
| 0.3.0 | 16/09/2026 | Operação RF01–RF15 | Reset de senha pelo admin; ficha condomínio; triagem vincula condomínio; chamado sem responsável e filtros; envio WA só após Aprovar; arquivo como rascunho; Inbox lidas/não tratadas; prazos 72h; dashboard KPIs; `AuditEvent` |
| 0.3.1 | 16/09/2026 | Escritório limpo | Seed só `admin@juricon.local` + WhatsApp Web; sem funcionário demo, DevMock nem Cloud. `pnpm db:reset-operacao` zera cadastros/triagem/chamados (não apaga o admin nem o canal Baileys) |
| 0.3.2 | 16/09/2026 | Interface operacional | Redesign UX/UI: shell silencioso, dashboard de atenção, inbox 3 painéis, triagem em fila + `/triagem/[id]`, chamados em tabela, drawers/dialogs, estados empty/loading/error. Sem mudança das regras §7 |
| 0.3.3 | 16/09/2026 | Inbound WhatsApp LID | `messages.upsert` com `remoteJid` só `@lid` (sem `remoteJidAlt`) deixa de ser `{ ignored: incomplete }`. Identidade estável `+999` + LID; continua **não identificado** até o admin vincular contato. Não usa o `sender` do envelope (número do escritório) |
| 0.3.4 | 16/09/2026 | Triagem em thread | `/triagem/[id]` painel de conversa (bolhas + hora, `GET /api/conversations/:id/messages`); classificação à direita. Sem composer. Bolhas compartilhadas com a Inbox (`message-bubbles.tsx`) |
| 0.3.5 | 16/09/2026 | Kanban de chamados | `/chamados` em quadro por status (Aberto / Em andamento / Aguardando / Resolvido); cards expansíveis; arrastar ou **Mover para** faz PATCH de status. Ficha `/chamados/[id]` inalterada. Lista `pageSize=50`; aviso se `total` maior |
| 0.3.6 | 16/09/2026 | Inbox envia WhatsApp | Mensagem pública chama o provider na hora (sem Aprovar). Composer: responder (citação), arquivo visível, gravar áudio. `apenasRascunho` bloqueia envio. Reenviar usa `POST /api/messages/:id/approve` só para `failed`/`draft` antigo |
| 0.3.7 | 16/09/2026 | Cards na atividade | Ficha `/chamados/[id]`: mensagens em card (selo WhatsApp/nota/cliente); `ticket.patch` e demais audits em linha. Sem mudança de API nem envio |
| 0.3.8 | 16/09/2026 | Conversa única por número | `Conversation.peerPhoneE164` único por conexão; `ContactIdentity` (telefone/LID). Ingest não reutiliza “qualquer não identificado”. Identify grava alias LID e funde threads do mesmo contato |
| 0.3.9 | 16/09/2026 | Modais na ficha | Ficha `/chamados/[id]`: **Enviar arquivo** e **Adicionar prazo** abrem `Dialog`. Listas ficam na página. Upload só após confirmar no modal. APIs iguais |
| 0.3.11 | 17/09/2026 | Número WhatsApp real | Inbox/triagem/dashboard **não** exibem placeholder LID `+999…` como telefone (rótulo “Número não informado pelo WhatsApp”). Webhook prefere `remoteJidAlt` / `senderPn` ao LID; ignora `data.jid` (número do escritório); remove sufixo de aparelho `:device`. Identify/ingest gravam o E.164 real no `peerPhoneE164` quando o LID deixa de ser a única identidade. Celular BR 8 dígitos após o DDD aparece com o 9 na UI |
| 0.4.0 | 17/09/2026 | Números não vinculados | Contato cadastrado uma vez (nome + condomínio). Inbound no fluxo abre triagem já com contato/condo. Número avulso vai a `/nao-vinculados` (admin, só chat). Sem Identificar na triagem. |
| 0.4.1 | 17/09/2026 | Vínculo cadastro ↔ LID | Cadastro no condomínio grava o alias LID do WhatsApp quando o nome casa com **um** chat `@lid` da Evolution. A mensagem seguinte daquele aparelho entra no fluxo sem cadastrar de novo. Webhook também lê `previousRemoteJid` / `sender_pn`. Em Não vinculados, telefone é obrigatório se o WhatsApp não mostrou o número; dá para escolher contato já cadastrado. |
| 0.6.0 | 18/09/2026 | CRM de controle | Paleta cinza-neutra, tokens de status/prioridade, Toolbar, kanban com faixa colorida, Documentos em pastas por condomínio (`GET /api/documents/summary`). **Prazos saem da UI** (tela, menu, dashboard, ficha). API `/api/deadlines` e tabela `Deadline` permanecem. |
| 0.4.2 | 17/09/2026 | Envio sem telefone visível | Resposta pública em Não vinculados **não** exige cadastro de telefone. Se o WhatsApp só mandou LID, o envio usa o JID `@lid` do chat na Evolution. O aviso “cadastre um número real para enviar” sai do composer. Telefone real continua obrigatório só para **Cadastrar no fluxo**. |

## 3. Mapa de telas / conexões

```
/login → cookie sessão
  → / dashboard (KPIs operacionais)
  → /atendimento Inbox (conversas no fluxo; envio WA na hora)
  → /triagem (admin) fila de demandas já cadastradas; `/triagem/[id]` classificar / arquivar / promover
  → /nao-vinculados (admin) números sem cadastro; só chat + cadastrar no fluxo
  → /chamados quadro Kanban (filtros) → /chamados/[id] ficha
  → /documentos pastas por condomínio → arquivos do condomínio
  → /conexoes (admin)
  → /condominios lista → /condominios/[id] ficha
  → /equipe (admin, editar, redefinir senha)
```

Inbound: webhook Evolution ou `POST /api/dev/mock-inbound` → Conversation + Message. **TriageItem só se o contato já tem condomínio.** Número avulso não cria triagem. **Não cria Ticket.** Admin promove na triagem.

## 4. Papéis e acesso

| Papel | Acesso |
|-------|--------|
| admin | Todas as telas e APIs; cria chamado manual; cadastra equipe |
| funcionario | Login, condomínios GET (ficha filtrada aos chamados atribuídos). Inbox das conversas dos **seus** chamados, chamados/documentos **só atribuídos**. **403** em triagem, não vinculados, conexões, equipe, auditoria, ticket/arquivo alheio, PATCH cadastral. Envio público se `podeResponderCliente` e não `apenasRascunho`. |

Autorização só no servidor (`requireSession` / `requireAdmin` / `requireTicketAccess`). Menu esconde rotas; isso **não** autoriza.

IDOR: recurso existente mas alheio → **403**. Inexistente → **404**. Sem 404 falso para mascarar ticket de outro usuário do mesmo escritório.

Single-tenant: um escritório, sem `companyId`. Contrato não permite SaaS multi-escritório.

## 5. Índice de rotas e “onde olhar no código”

| Rota UI | API | Código |
|---------|-----|--------|
| `/login` | `POST /api/auth/login` | `app/login/page.tsx`, `app/api/auth/login/route.ts` |
| Shell autenticado | — | `components/layout/app-shell.tsx` |
| `/` | `GET /api/dashboard` | `app/(app)/page.tsx` |
| `/atendimento` | `GET /api/conversations`, messages | `app/(app)/atendimento/page.tsx`, `components/atendimento/thread-panel.tsx` |
| `/triagem` | `GET/PATCH /api/triage` | `app/(app)/triagem/page.tsx` |
| `/triagem/[id]` | `GET/PATCH /api/triage/:id`, `GET /api/conversations/:id/messages` | `app/(app)/triagem/[id]/page.tsx`, `components/atendimento/message-bubbles.tsx` |
| `/nao-vinculados` | `GET /api/conversations?unlinked=1`, `POST .../enroll`, messages | `app/(app)/nao-vinculados/page.tsx` |
| `/chamados` | `GET/POST /api/tickets`, `PATCH /api/tickets/:id` (status no quadro) | `app/(app)/chamados/page.tsx`, `components/chamados/kanban-board.tsx`, `ticket-card.tsx` |
| `/chamados/[id]` | `GET/PATCH /api/tickets/:id`, messages | `app/(app)/chamados/[id]/page.tsx` |
| `/documentos` | `GET /api/documents/summary`, `GET/POST /api/documents`, `GET /api/files/...` | `app/(app)/documentos/page.tsx` |
| `/conexoes` | `GET/POST /api/connections`, `GET .../qr`, `GET .../status`, `POST .../disconnect`, webhook, mock | `app/(app)/conexoes/page.tsx`, `components/conexoes/whatsapp-session-card.tsx`, `whatsapp-service.ts` |
| `/condominios` | `/api/condominiums`, `/api/contacts` | `app/(app)/condominios/page.tsx` |
| `/condominios/[id]` | `GET/PATCH /api/condominiums/:id` | `app/(app)/condominios/[id]/page.tsx` |
| `/equipe` | `GET/POST/PATCH /api/team` | `app/(app)/equipe/page.tsx` |
| — | `POST /api/messages/:id/approve` (reenvio failed/draft) | `app/api/messages/[id]/approve/route.ts`, `whatsapp-dispatch.ts` |
| — | `GET /api/audit` | `app/api/audit/route.ts` |
| — | `POST /api/conversations/:id/enroll` (admin, cadastrar no fluxo) | `app/api/conversations/[id]/enroll/route.ts` |
| — | `POST /api/conversations/:id/read` | `app/api/conversations/[id]/read/route.ts` |
| — | `POST /api/documents/:id/send-draft` | `app/api/documents/[id]/send-draft/route.ts` |
| — | `GET /api/documents/summary` | `app/api/documents/summary/route.ts`, `document-service.ts` |
| — | `GET/POST/PATCH /api/deadlines` (sem tela) | `app/api/deadlines/`, `deadline-service.ts` |
| — | `GET /api/health`, `/api/health/ready` | `app/api/health/` |
| — | `POST /api/webhooks/evolution` | `app/api/webhooks/evolution/route.ts`, `lib/channels/evolution-webhook.ts`, `lib/channels/evolution-lid-map.ts` |

Guards: `lib/auth/guards.ts`, `lib/auth/ticket-access.ts`. Serviços: `lib/services/*` (`contact-identity.ts`, `conversation-merge.ts`, `operational-flow.ts`). Índice futuro: `lib/search/document-index-port.ts` (no-op). Canais: `lib/channels/`. Telefone: `lib/phone/e164.ts`, `lib/phone/identity.ts`, `lib/phone/display.ts`.

**Não existe** `/sindico`, botão de indexar IA, LLM.

## 6. Telas e fluxos (fichas)

### 6.1 Login

| Aba / seção | Campo | O que é | Obrigatório | Quem preenche | De onde vem | Para onde conecta | Como funciona | Regra / bloqueio | Onde olhar no código |
|-------------|-------|---------|-------------|---------------|-------------|-------------------|----------------|------------------|----------------------|
| Formulário | E-mail | Identificador | Sim | Usuário | Digitação | Sessão | Cookie httpOnly | 401 genérico | `app/login/page.tsx` |
| Formulário | Senha | Segredo | Sim | Usuário | Digitação | Hash bcrypt | Rate limit | Não revela se e-mail existe | `app/api/auth/login/route.ts` |
| Texto | Esqueceu? | Orientação | Não | Sistema | Copy | Equipe | Sem e-mail; admin redefine senha | Sem SMTP | `app/login/page.tsx` |

### 6.2 Inbox

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Lista | Filtros | Todas / não lidas / triagem | — | `unread` / triage `aberto`. **Só conversas no fluxo** (contato + condomínio) | Número avulso não aparece | `atendimento-service.ts` |
| Lista | Conversas | Thread por `peerPhoneE164` | — | Admin: no fluxo; funcionario só conversas com ticket `assignedToId=eu`. Telefone E.164 formatado, ou “Número não informado pelo WhatsApp” se LID `+999` | 403 se conversa alheia | `atendimento-service.ts`, `lib/phone/display.ts` |
| Composer | Resposta | Pública | Condicional | `postMessage` dispara `dispatchToWhatsApp` | Sessão live `open`; `apenasRascunho` → 403; destino = telefone do contato ou `peerPhoneE164` real | `postMessage`, `whatsapp-dispatch.ts` |
| Composer | Responder | Citação | Não | `replyToId` na mesma conversa; quoted no provider (retry sem quoted se 400) | — | `atendimento/page.tsx` |
| Composer | Nota interna | Só escritório | Não | Grava `visibility=interna` | **Nunca** envia ao WhatsApp | `postMessage` |
| Composer | Arquivo / áudio | Anexo WA | Não | FormData `file`; mic `MediaRecorder` → webm/ogg | Allowlist 8 MB | `conversations/[id]/messages` |

### 6.3 Triagem

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Fila | Analisar | Abre a ficha | — | `/triagem/[id]` | Admin; só itens no fluxo | `app/(app)/triagem/page.tsx` |
| Análise | Thread | Histórico WA | — | `GET` mensagens da conversa; bolhas in/out/nota; hora; scroll; sem caixa de resposta | Loading/empty/error só no painel | `message-bubbles.tsx`, `atendimento-service.listMessages` |
| Análise | Contato / condomínio | Só leitura | — | Vêm do cadastro. **Não há Identificar nem Vincular** | Troca de dados é em `/condominios` | `app/(app)/triagem/[id]/page.tsx` |
| Análise | Categoria / prioridade / responsável | Dados do chamado | Categoria e prioridade; responsável opcional | PATCH `promote` | Contato com condomínio (já garantido na fila) | `ticket-service.ts` |
| Análise | Arquivar | Fecha item | Não | status `arquivado` + auditoria | — | `app/api/triage/[id]/route.ts` |

PATCH `identify` / `linkCondominium` → **422** (“cadastre no condomínio ou em Não vinculados”).

### 6.3.1 Não vinculados

`/nao-vinculados` (admin). Números **sem** contato+condomínio. Recebe e envia WhatsApp como a Inbox. Sem triagem, sem chamado, sem IA. **Cadastrar no fluxo** (nome + condomínio + telefone) cria/atualiza `Contact`, grava `ContactIdentity`, abre `TriageItem` e tira a conversa desta tela.

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Lista | Números | Fora do fluxo | — | `GET /api/conversations?unlinked=1` | **requireAdmin**; funcionario 403 | `nao-vinculados/page.tsx` |
| Composer | Resposta | Pública | Condicional | Mesmo POST da Inbox. Telefone real se houver; senão JID `@lid` do chat na Evolution | Sessão WhatsApp `open`; admin | `thread-panel.tsx`, `whatsapp-dispatch.ts`, `evolution-lid-map.ts` |
| Contexto | Cadastrar no fluxo | Entra no fluxo | Nome + condomínio + telefone se LID | `POST /api/conversations/:id/enroll` | CSRF + admin. Telefone obrigatório se o WhatsApp não mostrou o número. Pode escolher contato já cadastrado | `cadastro-service.enrollConversation` |

### 6.4 Chamados

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Quadro | Colunas | Status `aberto` / `em_andamento` / `aguardando` / `resolvido` | — | Um GET `pageSize=50` agrupado no cliente; sem filtro `status` na query | Funcionario só os seus | `kanban-board.tsx` |
| Quadro | Card | Protocolo, título, prioridade, categoria, condomínio, responsável | — | **Detalhes** expande contato; **Abrir ficha** vai a `/chamados/[id]`. Barra lateral = prioridade; faixa da coluna = status | Expandir não chama GET `:id` | `ticket-card.tsx` |
| Quadro | Mover | PATCH só `{ status }` | Não | Arrastar entre colunas ou **Mover para** no card aberto; rollback se falhar | CSRF + `requireTicketAccess`; reatribuir não entra neste PATCH | `chamados/page.tsx` |
| Quadro | Filtros | busca, categoria, responsável, sem responsável | Não | Query no servidor; chips de status não existem mais | Funcionario ignora unassigned/outros | `ticket-service.ts` |
| Quadro | Truncamento | Aviso se `total` > itens | — | Teto de paginação 50 | — | `chamados/page.tsx` |
| Quadro | Novo manual | Cria chamado | Admin | POST; `assignedToId` opcional | Só admin | `app/api/tickets/route.ts` |
| Ficha | Cadastro | título/status/prioridade/categoria/responsável | Condicional | PATCH | Reatribuir só admin | `chamados/[id]/page.tsx` |
| Ficha | Atividade | Feed mensagens + audit (admin) | — | Timeline vertical ReUI (data, título, corpo). Nota interna em texto âmbar. Teto 20, mais recente primeiro | Só admin vê audit (`GET /api/audit`) | `components/ui/timeline.tsx`, `components/reui/timeline.tsx`, `chamados/[id]/page.tsx` |
| Ficha | Envio WA | Mensagem pública | Condicional | POST messages envia na hora | Sessão live `open`; contato identificado | `whatsapp-dispatch.ts` |
| Ficha | Docs | Enviar WhatsApp | Não | `POST /api/documents/:id/send-draft` envia na hora | IDOR 403 | `document-service.ts` |
| Ficha | Enviar arquivo | Upload no chamado | Não | Botão abre dialog; escolher arquivo e **Enviar** chama `POST /api/documents`. Empty: “Nenhum documento ainda” | jpeg/png/pdf/áudio, 8 MB no servidor | `chamados/[id]/page.tsx` |

### 6.5 Equipe

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Formulário | E-mail / nome / papel / flags | Cadastro | Sim | POST gera senha, hash bcrypt, UI mostra **uma vez** | Não loga senha | `team-service.ts` |
| Formulário | Não pode mandar WhatsApp | Flag `apenasRascunho` | Não | Bloqueia envio público (403) | Admin ignora a flag | `equipe/page.tsx` |
| Tabela | Editar / redefinir senha | PATCH | Admin | `resetPassword` gera senha e apaga sessões | Último admin ativo não desativa/rebaixa | `app/api/team/route.ts` |

### 6.6 Documentos

Pastas por condomínio. `GET /api/documents/summary` agrupa por `condominiumId` (mesmo escopo do `list`: admin vê tudo; funcionário só chamado atribuído). Clicar na pasta lista `GET /api/documents?condominiumId=`. Upload jpeg/png/pdf/áudio, máx. 8 MB, disco `uploads/`. `ingestStatus=stored`. Download autenticado `GET /api/files/...`. Na ficha `/chamados/[id]`, a lista fica na página; **Enviar arquivo** abre dialog. **Enviar WhatsApp** chama o canal na hora. Sem botão de IA.

### 6.7 Prazos (fora da UI)

A tela `/prazos`, o menu e os KPIs de prazo **não** aparecem na interface (v0.6.0). `GET/POST/PATCH /api/deadlines` e a tabela `Deadline` continuam no servidor. **Não** calcula prazo processual oficial. Sem e-mail.

### 6.8 Conexões (WhatsApp)

Vista padrão: um cartão **WhatsApp do escritório** (primeira `evolution_baileys` com “Escritório” no nome, senão a primeira Baileys). Status humano a partir de `liveStatus` (`open` → Conectado, `connecting` → Aguardando QR, resto → Desconectado). Sem `db:`, `live:` ou `secretStatus` na vista padrão. Mock, Cloud stub, extras e formulários ficam no accordion **Desenvolvimento**. Seed **não** cria DevMock nem Cloud; inbound DEV só aparece se o admin cadastrar um canal mock.

| Aba / seção | Campo / ação | O que é | Quem | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|--------------|---------|------|---------------|------------------|------------|
| Cartão | Status | Conectado / Aguardando QR / Desconectado | Admin | `liveStatus` da Evolution, não o texto do banco | Sem env → Conectar bloqueado + banner | `whatsapp-session-card.tsx` |
| Lista | `configured` | Env Evolution preenchida | Admin | `isConfigured()` (URL + APIKEY) | Sem env → aviso; QR/disconnect bloqueados | `evolution-baileys-provider.ts` |
| Lista | `liveStatus` | Estado na Evolution | Admin | `GET connectionState` no `list`/`status` | Sync `ChannelConnection.status` quando mapeável | `whatsapp-service.ts` |
| Botão | Conectar | Parear WhatsApp Web | Admin | Abre dialog + `GET /qr`; poll `GET /status` ~3s até `open` ou 60s | Só `evolution_baileys`; 409 nos outros. Poll só com o dialog aberto | `whatsapp-session-card.tsx`, `.../qr/route.ts` |
| Botão | Desconectar | Logout sessão | Admin | `DELETE /instance/logout/:name` + CSRF; some o QR | Só Baileys; Evolution 400/404 = já off | `.../disconnect/route.ts` |
| Accordion | Nova conexão | Cadastro canal | Admin | POST cria row; DevMock já `open`. Accordion em estado React (não `<details>`, evita hydration) | Secrets nunca reexibidos (`secretStatus` na API) | `app/api/connections/route.ts` |
| Accordion | Injetar inbound DEV | Mensagem fake | Admin | `POST /api/dev/mock-inbound` | Só development; não envia WhatsApp | `app/api/dev/mock-inbound/route.ts` |

### 6.9 Ficha do condomínio

`/condominios/[id]`: cadastro (nome, CNPJ 14 dígitos, endereço, cidade/UF, observação), contatos (admin adiciona/edita nome, telefone, cargo, e-mail), chamados/documentos/conversas **filtrados pela permissão**, histórico `GET /api/audit` (admin). PATCH cadastral só admin. Contato com condomínio **entra no fluxo**: próximas mensagens daquele telefone **ou do LID WhatsApp já gravado no cadastro** abrem triagem sem identificar de novo. No cadastro, se a Evolution tiver **um** chat `@lid` cujo pushName casa com o nome do contato (primeiro token, ≥4 letras), o alias LID é gravado em `ContactIdentity` e conversas não vinculadas daquele LID entram no fluxo.

### 6.10 Auditoria

Tabela `AuditEvent`. Ações: criar/editar usuário, reset senha, condomínio, contato, triagem, chamado, `message.send` / `message.send_failed`. Sem `passwordHash`/`passwordOnce`. `GET /api/audit` admin.

### 6.11 Interface (v0.3.2+)

- Shell: grupos Início / Atendimento / Operação / Cadastros / Sistema; busca contextual no header; indicador WhatsApp para admin; menu do usuário; navegação inferior no mobile (Início, Inbox, Docs). Atendimento: Inbox, Triagem (admin), Não vinculados (admin).
- Design system em `components/ui/` (Button, Input, Select, Badge, PageHeader, Toolbar, Dialog, Drawer, FilterChip, DataTable, EmptyState, ErrorBanner, ForbiddenState, Skeleton, Toast). Tokens de status/prioridade em `lib/ui-labels.ts`.
- Progressive disclosure: inbox lista → conversa → contexto no mobile; triagem `/triagem/[id]` thread + classificar (sem composer); chamados em Kanban com card expansível e faixa de status; documentos em pasta por condomínio; detalhes da ficha em accordion; QR do WhatsApp em dialog; envio de arquivo da ficha em dialog; criação/edição em drawer.
- Fraunces só no wordmark Juricon; Inter no restante da UI. Fundo cinza `#f5f6f8`; cards brancos; azul-petróleo `#1b3a4b` como marca.

## 7. Regras de negócio

1. Mensagem inbound de **contato com condomínio** → conversa + item de triagem. Sem Ticket automático. Número **sem** esse cadastro → conversa + mensagem, **sem** TriageItem (tela Não vinculados).
2. Número desconhecido → conversa `unidentified` com `peerPhoneE164` estável (E.164 real ou placeholder LID `+999…`). **Não** cria `Contact` sozinho. O mesmo peer na mesma conexão **não** abre thread nova. Cadastro (Condomínios ou `enroll`) grava alias em `ContactIdentity` (LID e variante BR 8/9) **uma vez**; as próximas mensagens são reconhecidas sozinhas. Se o peer era LID, passa a gravar o telefone do contato. A UI **não** mostra `+999…` como se fosse o número do WhatsApp. Se o webhook vier só com `@lid` (sem telefone), o ingest só entra no fluxo se aquele LID já estiver no contato — o cadastro tenta obter esse alias na Evolution pelo nome do chat.
3. `waMessageId` único: replay é sucesso idempotente (`created: false`).
4. Promover exige contato com condomínio, categoria e prioridade. `assignedToId` é opcional. Status triagem `promovido`. A triagem **não** identifica contato.
5. Chamado manual: somente admin. Responsável opcional.
6. Mensagem pública de quem pode responder chama `WhatsAppProvider.send` / `sendMedia` no mesmo POST (`sendStatus` sent ou failed). `apenasRascunho` → 403. `POST /api/messages/:id/approve` só reenvia `failed` ou `draft` antigo. Citação: `replyToId` + `quotedWaMessageId` quando existir.
7. Nota interna (`visibility=interna`) nunca chama o provider.
8. Webhook Evolution **fail-closed**: sem `EVOLUTION_WEBHOOK_SECRET` → 401. Compose com `WEBHOOK_GLOBAL_ENABLED=false` (global desta imagem não envia secret e retenta 401). Inbound: webhook da instância com `x-evolution-secret` via `POST /webhook/set/:instance` no `ensureInstance`. Payload v2 (objeto ou array, campos `null`, JID `@lid` com ou sem `remoteJidAlt`) é normalizado em `evolution-webhook.ts` (`fromPhone` + `waLid`). Telefone real vem de `remoteJidAlt` / `senderPn` / `sender_pn` / `@s.whatsapp.net` (sem sufixo `:device`); `previousRemoteJid` `@lid` vira o alias LID quando o `remoteJid` já veio como telefone. LID só vira `fromPhone` se não houver PN. Só `@lid` → conversa **não identificada** (placeholder `+999…`, **não** é telefone real e **não** é exibido como tal) **até** o contato ter esse LID em `ContactIdentity`. O campo `sender` do envelope e `data.jid` (WUID do escritório) **não** viram remetente. Ingest resolve conversa por `peerPhoneE164` / contato / alias — **não** por “qualquer unidentified”. Quando uma mensagem posterior traz E.164, o `peerPhoneE164` LID é promovido ao telefone. Evento inútil ou incompleto → **200** `{ ignored: true, reason }`. Rate limit 120/min **só** no ingest útil → **429** (não 422 de schema). A Evolution retenta 4xx; 422 de parse gerava loop.
9. DevMock sempre rotulado **DEV**. Cloud = stub “não configurado”. Baileys = “WhatsApp Web (não oficial)”.
10. Domínio fala `WhatsAppProvider`, nunca Evolution/Meta direto nas páginas.
11. Uploads: jpeg/png/pdf/áudio comum; SVG/HTML recusados; máx. 8 MB; disco `uploads/`.
12. `DocumentIndexPort` no-op; sem embedding.
13. Envelope API: `{ data, meta }` ou `{ error: { code, message, details } }`.
14. Paginação `page` + `pageSize` (máx. 50).
15. Envio público Baileys: consulta status vivo da Evolution (não só `ChannelConnection.status` no banco). Sessão ≠ `open` → 422 “WhatsApp Web não está conectado…”. `sendText` usa `{ number, text }` (Evolution v2.2.3). Destino: E.164 do contato/peer, ou JID `@lid` do chat (quando o WhatsApp não informou telefone). HTTP 400 só tenta `{ number, textMessage: { text } }` se o body indicar schema legado (falta `text` / `textMessage`). Número BR: no máximo uma variante 8↔9 dígitos após o DDD. `message` da Evolution pode ser string ou array — a 422 junta o texto (sem apikey). Ainda `!ok` → 422 `Evolution recusou envio (HTTP): …` e `sendStatus=failed`. Disconnect: HTTP 400 ou 404 = sessão já fechada (200 `close`).
16. Seed só `admin@juricon.local` + canal Baileys se faltar. Sem condomínio, contato, funcionário demo, DevMock ou Cloud. Testes de integração (`ingest`, `escritorio`) recusam o database `"PORTAL-JURIDICO"`; unitários (`unit`, `evolution-webhook`) não gravam no Postgres.

## 8. Como usar o sistema (guia do dia a dia)

1. Copiar `.env.example` → `.env` e preencher Postgres `"PORTAL-JURIDICO"` + `SEED_ADMIN_PASSWORD`.
2. `pnpm install`, `pnpm prisma migrate deploy` (ou `migrate dev`), `pnpm db:seed`. Para esvaziar cadastros/triagem/chamados sem apagar o admin: `pnpm db:reset-operacao` e depois `pnpm db:seed` só se o admin precisar ser regravado (`seed.ts` **não** recria demo).
3. `pnpm dev --port 3010` e abrir `/login`. Menu à esquerda (ícones Lucide); no celular, o gatilho da sidebar e as abas inferiores (Início, Inbox, Docs).
4. Login seed **somente** `admin@juricon.local`. Senha em `SEED_ADMIN_PASSWORD` no `.env` local (não documentada aqui). Funcionário, condomínio e contato você cria nas telas (Equipe / Condomínios). **Não** rode `tests/ingest` nem `tests/escritorio` com `DATABASE_URL` no banco `"PORTAL-JURIDICO"` (os testes abortam). Para esses arquivos, use outro database (ex. `PORTAL-JURIDICO-TEST`).
5. Admin: Condomínios (lista e ficha `/condominios/[id]`) → contatos (nome, telefone, cargo, e-mail). Esse cadastro é **uma vez**. Conexões → WhatsApp Web. Em `/atendimento` **Enviar** manda no WhatsApp (texto, arquivo ou áudio). **Responder** cita a mensagem. Número ainda não cadastrado cai em **Não vinculados** (`/nao-vinculados`), não na triagem. Lá o admin conversa e, se quiser, **Cadastrar no fluxo**. Se o WhatsApp não enviou o telefone (só LID), a UI mostra **Número não informado pelo WhatsApp** — não um `+999…`. Dá para **responder mesmo assim** (o envio usa o chat do WhatsApp). Telefone real só é obrigatório para cadastrar no fluxo. Dá para escolher um contato já cadastrado no condomínio. Se você cadastrou o nome no condomínio e o WhatsApp da sessão tem um único chat com esse nome, a próxima mensagem daquele aparelho já entra na triagem.
6. Triagem: na fila, **Analisar** abre `/triagem/[id]`. À esquerda o thread (como a Inbox, sem responder). Contato e condomínio já aparecem (só leitura). Categoria/prioridade/responsável (opcional) → **Promover a chamado**. Resposta ao WhatsApp continua na Inbox ou na ficha do chamado. Funcionário não vê Triagem nem Não vinculados (API 403).
7. Chamados (`/chamados`): quadro com colunas coloridas por status. **Detalhes** no card; arrastar pelo puxador ou **Mover para** muda o status (PATCH). Mensagens e docs ficam na ficha `/chamados/[id]`. Na ficha, **Enviar arquivo** abre um dialog. Na **Atividade**, a timeline lista mensagens e eventos. O histórico técnico (admin) fica no painel à direita. Funcionário vê e move só os seus. Menu Equipe / Conexões / Triagem não autoriza — o servidor continua 403.
8. `/documentos`: pasta por condomínio; dentro, arquivos em cards + preview no drawer; **Enviar WhatsApp** manda na hora. Download exige sessão.
9. Equipe: **Novo usuário** no drawer; editar flags no drawer; **Redefinir senha** (copia uma vez; sessões antigas caem). Sem “esqueci senha” por e-mail. Conexões: **Conectar** abre o QR em dialog (poll só com o dialog aberto).
10. VPS: hostname do Cloudflare Tunnel + `docs/deploy-vps.md`. Telas iguais; não abrir Evolution na internet.

O síndico **não** tem login neste sistema.

## 9. Checklist de validação

- [ ] `GET /api/health` e `/api/health/ready`
- [ ] Login admin; `/api/auth/me` sem hash
- [ ] Funcionário 403 em `/api/triage` e em ticket alheio
- [ ] Inbound mock de número **sem** cadastro → conversa **sem** triagem, **sem** ticket; aparece em `/nao-vinculados`
- [ ] Inbound de contato **com** condomínio → triagem com nome e condomínio; 2ª mensagem **não** pede identificar
- [ ] Promover com ou sem responsável
- [ ] Inbox Enviar (DevMock/`open`) grava `sent` e `sentToWhatsApp`; nota interna não chama o provider; `apenasRascunho` 403 na pública
- [ ] Funcionário 403 em `/api/audit` e em chamado sem responsável alheio
- [ ] Reset de senha pelo admin gera `passwordOnce` e derruba sessão
- [ ] Documento `stored`; download autenticado
- [ ] `GET /api/documents/summary` respeita o mesmo escopo do list (funcionário só atribuído)
- [ ] `docker compose config` (Evolution ≠ PORTAL-JURIDICO)
- [ ] `/conexoes` cartão principal: Conectado/Desconectado (sem `db:`/`live:`); Conectar gera QR; disconnect some o QR (com Docker + env)
- [ ] Conectar gera imagem (não 422 “QR ainda não gerado”; log Evolution sem `microsoft-standard-WSL2` no Browser)
- [ ] `/atendimento` Enviar: 201 com Baileys `open`; 422 explícito se sessão fechada ou Evolution recusar (`exists: false` / validação, não só Bad Request)
- [ ] Webhook Evolution: payload v2 típico **200** (ignored ou ingest); secret errado 401; flood de ingest 429; disconnect já off 200
- [ ] Webhook `messages.upsert` só com `remoteJid` `@lid` (sem `remoteJidAlt`) cria conversa **sem** triagem, não `{ ignored: incomplete }`; a UI **não** mostra `+999…` como telefone
- [ ] Cadastro de contato no condomínio + mensagem LID do mesmo nome na Evolution → triagem já com contato (sem Identificar)
- [ ] `/nao-vinculados` com chat só LID: **Enviar** habilitado (WhatsApp `open`); não mostra “cadastre um número real para enviar”
- [ ] `senderPn` / `remoteJidAlt` / `sender_pn` / `previousRemoteJid` viram o E.164 real; `data.jid` do escritório não vira remetente; JID `number:device@s.whatsapp.net` perde o sufixo de aparelho
- [ ] Duas mensagens do mesmo LID (e cadastrar no fluxo + terceira) permanecem no mesmo `conversationId`; variante BR 8/9 acha o contato cadastrado
- [ ] Funcionário 403 em `GET /api/conversations?unlinked=1` e em `POST .../enroll`
- [ ] Sem pgvector / DocumentChunk
- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` (com env prod): Next em `127.0.0.1:3010`, Evolution sem `8080` no host
- [ ] POST autenticado com `Origin` = `APP_PUBLIC_URL` não retorna 403 CSRF
- [ ] Sem cliente Redis no app Juricon
- [ ] `/chamados` mostra 4 colunas; expandir card; PATCH status ao mover persiste após F5
- [ ] `/chamados/[id]` Atividade: timeline com data e título; nota interna âmbar; histórico técnico no Frame (admin)
- [ ] `/chamados/[id]` Documentos: lista na página; Enviar arquivo abre dialog; upload só após Enviar
- [ ] Após `pnpm db:reset-operacao`: Equipe só admin; listas de condomínio/triagem/chamados/inbox vazias; sem canal `dev_mock`
- [ ] `tests/ingest` e `tests/escritorio` no `.env` do escritório **falham** na guarda (não inserem rows); unitários passam

## 10. Segurança (só o que existe)

- Sessão opaca em cookie httpOnly, SameSite=Lax, Secure em produção
- CSRF: `Origin` em POST autenticados; aceita também a origem de `APP_PUBLIC_URL` (túnel HTTPS)
- Rate limit in-memory no login e no **ingest** do webhook (QR/ignored não contam; estouro 429). IP: `CF-Connecting-IP`, senão `X-Forwarded-For`
- Prisma parametrizado + Zod
- IDOR ticket/documento/arquivo no servidor
- Secrets só em env; conexões devolvem `secretStatus: cadastrado`
- Senha de equipe gerada no servidor, bcrypt; não logada
- Proxy Next 16 (`proxy.ts`) redireciona UI sem cookie; APIs ainda validam sessão
- Sem RLS multiempresa (fora do contrato). Notebook: role **UNKNOWN** se o app usa superuser `postgres`. Compose prod: user `juricon` no Postgres do escritório (não é o Postgres da Evolution)

## 11. Deploy / ambiente (sem secrets)

Variáveis (ver `.env.example`): `DATABASE_URL`, `APP_PUBLIC_URL`, `SESSION_SECRET`, `SEED_ADMIN_PASSWORD`, `SEED_FUNCIONARIO_PASSWORD` (só notebook), `EVOLUTION_API_URL`, `EVOLUTION_APIKEY`, `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_INSTANCE`, `EVOLUTION_PORT`, `EVOLUTION_POSTGRES_PASSWORD` (Postgres **interno** da Evolution), `EVOLUTION_WEBHOOK_URL`, `JURICON_POSTGRES_PASSWORD` (só `docker-compose.prod.yml`).

- Notebook: `docker-compose.yml` (Evolution + Redis + Postgres Evolution). Next no host.
- VPS: `docker-compose.yml` + `docker-compose.prod.yml` — Next, Postgres Juricon, Evolution **sem** porta no host; webhook `http://juricon-app:3000/api/webhooks/evolution`. Ingress: Cloudflare Tunnel → `127.0.0.1:3010`. Redis só da Evolution (não cache do app).
- Guia: `docs/deploy-vps.md`. Backup: `infra/deploy/backup.sh` + `docs/backup-nota.md`. IA futura: `docs/architecture/ai-future.md` (**não implementado**).

## 12. Ao atualizar este documento

Atualizar capa, §2.1, fichas e regras na mesma entrega em que o comportamento mudar. Não gravar senhas.
