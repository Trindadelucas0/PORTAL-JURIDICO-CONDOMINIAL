# Juricon — Documentação do Sistema

| Item | Valor |
|------|--------|
| Versão do sistema | 0.9.3 — QR WhatsApp fresco |
| Última atualização | 21/09/2026 (Conexões: QR atualiza sozinho; cache 20s; GET /qr?fresh=1) |
| Fonte oficial | Este arquivo |
| Repositório | pasta `PORTAL JURIDICO CONDOMINIAL` (GitHub PORTAL-JURIDICO-CONDOMINIAL) |

## 1. Como usar este documento

Fonte única de comportamento. Não descreve o protótipo da pasta pai (`condominio-advogada`) nem o questionário `perguntas/`.

Catálogo visual as-is (wireframes ASCII, cores, botões) para auditoria UX/UI: [`docs/WIREFRAME-TELAS.md`](docs/WIREFRAME-TELAS.md). Não substitui as regras deste arquivo.

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
| 0.9.3 | 21/09/2026 | QR WhatsApp fresco | `/conexoes` dialog: poll `GET /qr?fresh=1` ~15s + botão **Atualizar QR**; cache in-memory 20s (não 120s); webhook não troca PNG por `code` texto. Evita scan com QR já inválido no celular. |
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
| 0.6.1 | 18/09/2026 | Thread na viewport | Inbox, Não vinculados e `/triagem/[id]`: altura travada na tela; lista, bolhas e contexto rolam por painel; composer fica no rodapé da coluna (`thread-panel.tsx`). |
| 0.7.0 | 18/09/2026 | Workspace operacional | Tokens radius 6–8px; Frame ghost; sidebar 14rem; main full-bleed nas rotas operacionais; Visão = AGORA/Atenção/Minha operação/Atividade; Inbox 280/1fr/220 + mensagens agrupadas; Não vinculados CTA **Vincular ao fluxo**; Triagem split lista+análise; Kanban compacto; ficha dossiê; Documentos/Condomínios lista densa. Sem mudança §7. |
| 0.7.1 | 18/09/2026 | Mensagens live | Inbox, Não vinculados, Triagem e ficha do chamado fazem poll a cada 3s (`livePollQuery`) nas listas e nas bolhas. Mensagem inbound aparece sem F5. Aba em segundo plano não polla. Sem SSE. |
| 0.7.3 | 18/09/2026 | Chamados e Não vinculados | Kanban compacto (prioridade em faixa, empty quieto, chips no mobile). Não vinculados = fila de identidade + evidência + Vincular ao fluxo. `Conversation.peerDisplayName` (pushName do webhook). Sem mudança §7 de Ticket automático. |
| 0.9.2 | 21/09/2026 | Workspace operacional UX | `/nao-vinculados` drawer **Vincular**: botão **Puxar do WhatsApp** ao lado do Telefone se `connection.status=open` e sem PN; reusa `POST .../enrich-peer`; toast se a Evolution não liberar o número. |
| 0.9.1 | 21/09/2026 | Workspace operacional UX | `/conexoes` **Conectar**: se a Evolution estiver parada (`fetch failed`), `GET /qr` responde 503 com texto no dialog e **Tentar de novo** — não fica em “Aguardando conexão…”. Poll de `/status` só depois de QR. Notebook: `docker compose up -d`. |
| 0.9.0 | 21/09/2026 | Workspace operacional UX | Nav plana Operação/Administração; Prazos de volta (`/prazos`); Visão = número + significado + ação (só se count>0); Inbox com contexto progressivo e composer honesto; Triagem estação de decisão; vínculo com confirmação; Chamados quadro+lista; ficha em abas + timeline; Documentos lista operacional; condomínio hub; Equipe com carga; Conexões sem mock em produção. `apenasRascunho` grava rascunho público (não 403). Sem IA e sem portal do síndico. |
| 0.8.1 | 21/09/2026 | Telefone e foto WhatsApp | Máscara BR em todo telefone. Ingest/abertura resolve PN do chat LID via Evolution `findChats`. Foto de perfil baixada no servidor (`peerAvatarKey` / `Contact.avatarKey`) na Inbox, Não vinculados, triagem, ficha e drawer. Vincular ao fluxo: número WA travado e vira `phoneE164` principal. |
| 0.8.0 | 18/09/2026 | Ficha de documentos | `/documentos` lista todos os condomínios (count 0 permitido). **Novo documento** abre ficha (`kind`, `title`, `purpose`, `notes?` + arquivo) gravada em `OfficeDocument`. Summary/list/upload no Postgres; sem localStorage. Mesma ficha no chamado. |
| 0.7.4 | 18/09/2026 | Central de operação | Visão `/`: AGORA = Não vinculados / Triagem / Não lidas / Abertos (`naoLidas` = unread real, não `recent.length`). Atenção = fila de ação. WhatsApp no header. Minha operação com badge e idade. Atividade em log. Sem cards. |
| 0.7.2 | 18/09/2026 | Densidade operacional | `html { font-size: 14px }` (escala rem ~12,5% menor). Inbox/workspace lista 240px. Faixa AGORA `text-xl`. Sem mudança de regras. |
| 0.4.2 | 17/09/2026 | Envio sem telefone visível | Resposta pública em Não vinculados **não** exige cadastro de telefone. Se o WhatsApp só mandou LID, o envio usa o JID `@lid` do chat na Evolution. O aviso “cadastre um número real para enviar” sai do composer. Telefone real continua obrigatório só para **Cadastrar no fluxo**. |

## 3. Mapa de telas / conexões

```
/login → cookie sessão
  → / Visão (blocos de ação só se count>0 + Minha operação + Atividade)
  → /atendimento Inbox (3 painéis: lista, conversa, contexto progressivo)
  → /triagem (admin) fila + decisão; `/triagem/[id]` deep link
  → /nao-vinculados (admin) identidade + confirmação antes do enroll
  → /chamados Quadro | Lista → /chamados/[id] abas Resumo/Atividade/Documentos/Comunicação
  → /prazos Todos/Hoje/Próximos/Atrasados (API Deadline)
  → /documentos lista operacional (filtro condomínio/chamado)
  → /conexoes (admin; mock só em development)
  → /condominios lista → /condominios/[id] hub (abas)
  → /equipe (admin; carga de chamados abertos)
```

Inbound: webhook Evolution ou `POST /api/dev/mock-inbound` → Conversation + Message. **TriageItem só se o contato já tem condomínio.** Número avulso não cria triagem. **Não cria Ticket.** Admin promove na triagem.

## 4. Papéis e acesso

| Papel | Acesso |
|-------|--------|
| admin | Todas as telas e APIs; cria chamado manual; cadastra equipe |
| funcionario | Login, condomínios GET (ficha filtrada aos chamados atribuídos). Inbox das conversas dos **seus** chamados, chamados/documentos **só atribuídos**. **403** em triagem, não vinculados, conexões, equipe, auditoria, ticket/arquivo alheio, PATCH cadastral. Envio público imediato se `podeResponderCliente` e não `apenasRascunho`. Com `apenasRascunho` + `podeResponderCliente`: grava rascunho público para o admin aprovar. |

Autorização só no servidor (`requireSession` / `requireAdmin` / `requireTicketAccess`). Menu esconde rotas; isso **não** autoriza.

IDOR: recurso existente mas alheio → **403**. Inexistente → **404**. Sem 404 falso para mascarar ticket de outro usuário do mesmo escritório.

Single-tenant: um escritório, sem `companyId`. Contrato não permite SaaS multi-escritório.

## 5. Índice de rotas e “onde olhar no código”

| Rota UI | API | Código |
|---------|-----|--------|
| `/login` | `POST /api/auth/login` | `app/login/page.tsx`, `app/api/auth/login/route.ts` |
| Shell autenticado | — | `components/layout/app-shell.tsx`, `more-sheet.tsx` |
| `/` | `GET /api/dashboard` (`naoLidas`, `rascunhos`, prazos) | `app/(app)/page.tsx`, `atendimento-service.dashboardKpis` |
| `/atendimento` | `GET /api/conversations`, messages (poll 3s) | `app/(app)/atendimento/page.tsx`, `thread-panel.tsx`, `message-composer.tsx`, `lib/client/live-poll.ts` |
| `/triagem` | `GET/PATCH /api/triage` | `app/(app)/triagem/page.tsx` |
| `/triagem/[id]` | `GET/PATCH /api/triage/:id`, messages (poll 3s) | `app/(app)/triagem/[id]/page.tsx`, `triage-analysis-panel.tsx`, `message-bubbles.tsx` |
| `/nao-vinculados` | `GET /api/conversations?unlinked=1` (poll 3s), `POST .../enroll`, messages | `app/(app)/nao-vinculados/page.tsx`, `unlinked-queue.tsx`, `unlinked-identity-panel.tsx` |
| `/chamados` | `GET/POST /api/tickets` (`view=lista`, `priority`, `condominiumId`, `unassigned`), `PATCH /api/tickets/:id` | `app/(app)/chamados/page.tsx`, `kanban-board.tsx`, `ticket-list.tsx`, `ticket-card.tsx` |
| `/chamados/[id]` | `GET/PATCH /api/tickets/:id`, messages (poll 3s), deadlines | `app/(app)/chamados/[id]/page.tsx` |
| `/prazos` | `GET/PATCH /api/deadlines` (`overdue`, `dueSoon`) | `app/(app)/prazos/page.tsx`, `deadline-service.ts` |
| `/documentos` | `GET /api/documents/summary`, `GET/POST /api/documents`, `GET /api/files/...` | `app/(app)/documentos/page.tsx` |
| `/conexoes` | `GET/POST /api/connections`, `GET .../qr`, `GET .../status`, `POST .../disconnect`, webhook, mock | `app/(app)/conexoes/page.tsx`, `whatsapp-session-card.tsx`, `whatsapp-service.ts` |
| `/condominios` | `/api/condominiums`, `/api/contacts` | `app/(app)/condominios/page.tsx` |
| `/condominios/[id]` | `GET/PATCH /api/condominiums/:id` | `app/(app)/condominios/[id]/page.tsx` |
| `/equipe` | `GET/POST/PATCH /api/team` (`openTickets`) | `app/(app)/equipe/page.tsx`, `team-service.ts` |
| — | `POST /api/messages/:id/approve` (rascunho público ou `failed`) | `app/api/messages/[id]/approve/route.ts`, `whatsapp-dispatch.ts` |
| — | `GET /api/audit` | `app/api/audit/route.ts` |
| — | `POST /api/conversations/:id/enroll` (admin, cadastrar no fluxo; número WA manda no Contact) | `app/api/conversations/[id]/enroll/route.ts` |
| — | `POST /api/conversations/:id/enrich-peer` (PN LID + foto; lazy na abertura) | `app/api/conversations/[id]/enrich-peer/route.ts`, `peer-avatar-service.ts` |
| — | `POST /api/conversations/:id/read` | `app/api/conversations/[id]/read/route.ts` |
| — | `POST /api/documents/:id/send-draft` | `app/api/documents/[id]/send-draft/route.ts` |
| — | `GET /api/documents/summary` | `app/api/documents/summary/route.ts`, `document-service.ts` |
| — | `GET/POST/PATCH /api/deadlines` | `app/api/deadlines/`, `deadline-service.ts` |
| — | `GET /api/health`, `/api/health/ready` | `app/api/health/` |
| — | `POST /api/webhooks/evolution` | `app/api/webhooks/evolution/route.ts`, `lib/channels/evolution-webhook.ts`, `lib/channels/evolution-lid-map.ts` |

Guards: `lib/auth/guards.ts`, `lib/auth/ticket-access.ts`. Serviços: `lib/services/*` (`contact-identity.ts`, `conversation-merge.ts`, `operational-flow.ts`, `peer-avatar-service.ts`). Índice futuro: `lib/search/document-index-port.ts` (no-op). Canais: `lib/channels/` (`evolution-peer-profile.ts`). Telefone: `lib/phone/e164.ts`, `lib/phone/identity.ts`, `lib/phone/display.ts`, `lib/phone/mask.ts`, `lib/phone/avatar-url.ts`.

**Não existe** `/sindico`, botão de indexar IA, LLM.

## 6. Telas e fluxos (fichas)

### 6.1 Login

| Aba / seção | Campo | O que é | Obrigatório | Quem preenche | De onde vem | Para onde conecta | Como funciona | Regra / bloqueio | Onde olhar no código |
|-------------|-------|---------|-------------|---------------|-------------|-------------------|----------------|------------------|----------------------|
| Formulário | E-mail | Identificador | Sim | Usuário | Digitação | Sessão | Cookie httpOnly | 401 genérico | `app/login/page.tsx` |
| Formulário | Senha | Segredo | Sim | Usuário | Digitação | Hash bcrypt | Rate limit | Não revela se e-mail existe | `app/api/auth/login/route.ts` |
| Query | `expired=1` | Sessão | Não | Proxy | Login | Mensagem “Sessão expirada” se redirecionar de rota autenticada (não da Visão `/`) | 401 continua genérico | `proxy.ts`, `app/login/page.tsx` |

### 6.2 Inbox

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Lista | Filtros | Todas / não lidas / triagem | — | `unread` / triage `aberto`. **Só conversas no fluxo** (contato + condomínio) | Número avulso não aparece | `atendimento-service.ts` |
| Lista | Conversas | Thread por `peerPhoneE164` | — | Admin: no fluxo; funcionario só conversas com ticket `assignedToId=eu`. Telefone E.164 formatado, ou “Número não informado pelo WhatsApp” se LID `+999`. Lista e bolhas **poll 3s** (`livePollQuery`; sem poll com a aba em background) | 403 se conversa alheia | `atendimento-service.ts`, `thread-panel.tsx`, `lib/client/live-poll.ts` |
| Composer | Resposta | Pública | Condicional | Quem pode enviar dispara `dispatchToWhatsApp`. `apenasRascunho` grava `visibility=publica` `sendStatus=draft` (`awaitingApproval`) | Sessão live `open`; sem `podeResponderCliente` → 403; destino = telefone do contato ou `peerPhoneE164` real | `postMessage`, `whatsapp-dispatch.ts`, `message-composer.tsx` |
| Composer | Aprovação | Rascunho público | Condicional | Admin: **Aprovar e enviar** → `POST /api/messages/:id/approve`. Bolha RASCUNHO na thread e na ficha Comunicação | Só admin despacha | `approval-panel.tsx`, `whatsapp-dispatch.ts` |
| Composer | Responder | Citação | Não | `replyToId` na mesma conversa; quoted no provider (retry sem quoted se 400) | — | `atendimento/page.tsx` |
| Composer | Nota interna | Só escritório | Não | Grava `visibility=interna` | **Nunca** envia ao WhatsApp | `postMessage` |
| Composer | Arquivo / áudio | Anexo WA | Não | FormData `file`; mic `MediaRecorder` → webm/ogg | Allowlist 8 MB | `conversations/[id]/messages` |
| Layout | Painéis | Lista + thread + contexto | — | Workspace ~240/1fr/220; altura viewport; bolhas agrupadas por dia; contexto recolhível; composer fixo | Mobile: um painel por vez | `workspace-shell.tsx`, `thread-panel.tsx`, `message-groups.ts` |

### 6.3 Triagem

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Fila | Solicitações | Lista split | — | Clique seleciona; análise à direita; deep link `/triagem/[id]` | Admin; só itens no fluxo | `app/(app)/triagem/page.tsx` |
| Análise | Thread | Histórico WA | — | `GET` mensagens (poll 3s); bolhas agrupadas; sem composer | Loading/empty/error só no painel | `triage-analysis-panel.tsx`, `message-bubbles.tsx`, `lib/client/live-poll.ts` |
| Análise | Contato / condomínio | Só leitura | — | Vêm do cadastro. **Não há Identificar nem Vincular** | Troca de dados é em `/condominios` | `triage-analysis-panel.tsx` |
| Análise | Categoria / prioridade / responsável | Dados do chamado | Categoria e prioridade; responsável opcional | PATCH `promote` | Contato com condomínio (já garantido na fila) | `ticket-service.ts` |
| Análise | Promover a chamado | Cria ticket | — | Botão primário | — | `triage-analysis-panel.tsx` |
| Análise | Arquivar | Fecha item | Não | status `arquivado` + auditoria | — | `app/api/triage/[id]/route.ts` |

PATCH `identify` / `linkCondominium` → **422** (“cadastre no condomínio ou em Não vinculados”).

### 6.3.1 Não vinculados

`/nao-vinculados` (admin). Números **sem** contato+condomínio. Recebe e envia WhatsApp como a Inbox. Sem triagem, sem chamado, sem IA. **Vincular** abre o cadastro; **Confirmar vínculo** (nome, telefone, condomínio) chama `POST .../enroll`, cria/atualiza `Contact`, grava `ContactIdentity`, abre `TriageItem` e tira a conversa desta tela. **Não** cria Ticket.

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Lista | Fila fora do fluxo | Threads sem cadastro | — | `GET /api/conversations?unlinked=1` (poll 3s). Item: nome (`contact.nome` → `peerDisplayName` → telefone → “Contato WhatsApp”), preview, idade, origem. Sem o parágrafo LID em todas as linhas | **requireAdmin**; funcionario 403 | `unlinked-queue.tsx`, `lib/phone/display.ts` |
| Composer | Resposta | Pública | Condicional | Mesmo POST da Inbox. Telefone real se houver; senão JID `@lid` do chat na Evolution | Sessão WhatsApp `open`; admin | `thread-panel.tsx`, `whatsapp-dispatch.ts`, `evolution-lid-map.ts` |
| Contexto | Identidade | Etapas + CTA | Nome + condomínio + telefone se LID; cargo opcional | Painel com foto (`peerAvatarUrl`); CTA abre drawer. Ao abrir e em **Puxar do WhatsApp**, `POST .../enrich-peer` tenta PN/foto na Evolution. Número real → campo travado “Vindo do WhatsApp”. Botão **Puxar do WhatsApp** só se `connection.status=open` e telefone ainda não travado | CSRF + admin. Telefone obrigatório só se Evolution não liberar PN. Contato já cadastrado não sobrescreve o número WA | `unlinked-identity-panel.tsx`, `PhoneInput`, `canPullWhatsAppPhone` (`lib/phone/identity.ts`), `cadastro-service.enrollConversation` |
| Layout | Painéis | Fila 280px + evidência + identidade | — | `WorkspaceShell cols=unlinked`; altura viewport; chat não estica a página | Tablet: identidade em painel/drawer; mobile: um painel | `nao-vinculados/page.tsx` |

### 6.4 Chamados

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Quadro / Lista | Toggle | `?view=` (padrão quadro; `lista`) | — | Mesmo GET `pageSize=50`. Lista tabular no desktop; cards no mobile | Sem segundo endpoint | `chamados/page.tsx`, `ticket-list.tsx` |
| Quadro | Colunas | Status `aberto` / `em_andamento` / `aguardando` / `resolvido` | — | Um GET `pageSize=50` agrupado no cliente; sem filtro `status` na query. Mobile: um status por vez (chips) | Funcionario só os seus | `kanban-board.tsx` |
| Quadro | Card | Protocolo, título, condo, prioridade (faixa + texto), responsável, prazo (`nextDeadline`), idade | — | Clique abre `/chamados/[id]`; menu ⋮ **Mover para**; DnD pelo puxador (desktop) | Sem expandir card | `ticket-card.tsx`; list include `deadlines` take 1 |
| Quadro | Mover | PATCH só `{ status }` | Não | Arrastar entre colunas (md+) ou menu **Mover para**; rollback se falhar | CSRF + `requireTicketAccess`; reatribuir não entra neste PATCH | `chamados/page.tsx` |
| Quadro | Filtros | chips Todos/Meus/Sem responsável; avançados recolhidos (categoria, prioridade, responsável) | Não | Query no servidor (`priority`, `unassigned`, `assignedToId`, `condominiumId` opcional). Busca da página só no mobile (shell cobre md+) | Funcionario ignora unassigned/outros | `ticket-service.ts` |
| Quadro | Truncamento | Aviso se `total` > itens | — | Teto de paginação 50 | — | `chamados/page.tsx` |
| Quadro | Novo manual | Cria chamado | Admin | POST; `assignedToId` opcional | Só admin | `app/api/tickets/route.ts` |
| Ficha | Header | protocolo, título, condo · contato, badges | — | Prazo mais próximo no header se `deadlines` | — | `chamados/[id]/page.tsx` |
| Ficha | Abas | Resumo / Atividade / Documentos / Comunicação | — | Uma aba de conteúdo + rail contexto (lg+). Timeline única (mensagem, nota, doc, status, responsável, prazo, aprovação) | Mobile: um painel | `section-tabs.tsx`, `timeline.tsx` |
| Ficha | Cadastro | título/status/prioridade/categoria/responsável | Condicional | PATCH na aba Resumo | Reatribuir só admin | `chamados/[id]/page.tsx` |
| Ficha | Atividade | Feed mensagens + audit (admin) | — | Timeline. Nota interna âmbar. Bolhas **poll 3s** | Só admin vê audit | `timeline.tsx`, `chamados/[id]/page.tsx` |
| Ficha | Comunicação | Composer + rascunhos | Condicional | Mesmas regras da Inbox | Sessão live `open`; `apenasRascunho` = rascunho | `message-composer.tsx`, `approval-panel.tsx` |
| Ficha | Docs | Enviar WhatsApp | Não | `POST /api/documents/:id/send-draft` envia na hora | IDOR 403 | `document-service.ts` |
| Ficha | Enviar arquivo | Upload no chamado | Não | Botão abre dialog; escolher arquivo e **Enviar** chama `POST /api/documents` | jpeg/png/pdf/áudio, 8 MB no servidor | `chamados/[id]/page.tsx` |

### 6.5 Equipe

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Formulário | E-mail / nome / papel / flags | Cadastro | Sim | POST gera senha, hash bcrypt, UI mostra **uma vez** | Não loga senha | `team-service.ts` |
| Formulário | Não pode mandar WhatsApp | Flag `apenasRascunho` | Não | Grava rascunho público; admin aprova | Admin ignora a flag | `equipe/page.tsx`, `atendimento-service.postMessage` |
| Tabela | Pessoa / função / acesso / status / chamados | Carga | — | `openTickets` = atribuídos não resolvidos no GET `/api/team`. Sem coluna “último acesso” (User não tem `lastLoginAt`) | Sem senha na lista | `team-service.ts` |
| Tabela | Editar / redefinir senha | PATCH | Admin | `resetPassword` gera senha e apaga sessões | Último admin ativo não desativa/rebaixa | `app/api/team/route.ts` |

### 6.6 Documentos

Pastas por condomínio viram **filtro** (`GET /api/documents/summary`). A tela principal é lista operacional: nome/título, tipo, condomínio, chamado, data. Preview no drawer. Sem GED.

**Novo documento** (Dialog) exige ficha no Postgres: `kind` (enum `DocumentKind`), `title` (2–160), `purpose` (10–2000), `notes` opcional, arquivo jpeg/png/pdf/áudio máx. 8 MB em `uploads/`. Admin pode gravar só no condomínio; funcionário precisa de `ticketId` atribuído. `POST /api/documents` multipart + CSRF; audit `document.create`. Sem localStorage/sessionStorage. `ingestStatus=stored`. Download autenticado `GET /api/files/...`. Lista/preview mostram tipo, título e finalidade. Na ficha `/chamados/[id]`, **Enviar arquivo** usa a mesma ficha. **Enviar WhatsApp** exige documento vinculado a chamado. Sem botão de IA.

| Aba / seção | Campo | O que é | Obrigatório | Quem | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|------|---------------|------------------|------------|
| Lista | Linhas | Documento com contexto | — | Sessão | Título, tipo, condo, chamado, data; clique abre preview | Empty distinto de filtro sem resultado | `documentos/page.tsx` |
| Toolbar | Condomínio / chamado | Filtro | Não | Sessão | Summary vira `<select>` de condomínio, não a tela principal | Teto 50 | `documentos/page.tsx` |
| Dialog | Tipo / Título / Para que serve / Arquivo | Ficha do acervo | Sim | Admin; func. com ticket | POST multipart grava `OfficeDocument` | Zod 422; func. sem ticket 403 | `document-ficha-form.tsx`, `kinds.ts` |
| Dialog | Chamado | Vínculo opcional | Condicional | Admin opcional; func. obrigatório | Filtrado pelo condomínio aberto | WhatsApp só com chamado | `documentos/page.tsx` |
| Preview | Ficha | Metadados do banco | — | Sessão | Drawer com tipo/finalidade | Download autenticado | `documentos/page.tsx` |

### 6.7 Prazos

`/prazos` (Operação). Consome `GET /api/deadlines` já existente. Filtros: Todos / Hoje (cliente sobre `dueAt`) / Próximos (`dueSoon=1`, 72h) / Atrasados (`overdue=1`). Concluir = `PATCH /api/deadlines/:id` `{ done: true }`. Criar prazo continua na ficha do chamado. **Não** calcula prazo processual oficial. Sem e-mail. Sem número inventado.

| Aba / seção | Campo | O que é | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|---------------|------------------|------------|
| Filtros | Chips | Recorte da lista | Query `overdue` / `dueSoon`; Hoje filtra no cliente | Funcionario só prazos dos seus chamados | `prazos/page.tsx`, `deadline-service.ts` |
| Lista | Linha | Título, vencimento, chamado | Link `#protocolo` → ficha | Empty por filtro | `prazos/page.tsx` |

### 6.8 Conexões (WhatsApp)

Vista padrão: um cartão **WhatsApp do escritório** (primeira `evolution_baileys` com “Escritório” no nome, senão a primeira Baileys). Status humano a partir de `liveStatus` (`open` → Conectado, `connecting` → Aguardando QR, resto → Desconectado). Sem `db:`, `live:` ou `secretStatus` na vista padrão. Mock, Cloud stub, extras e formulários ficam no accordion **Desenvolvimento**, **somente `NODE_ENV=development`**. Produção mostra o cartão Baileys (e extras Baileys compactos) sem mock nem inbound fake. Seed **não** cria DevMock nem Cloud.

| Aba / seção | Campo / ação | O que é | Quem | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|--------------|---------|------|---------------|------------------|------------|
| Cartão | Status | Conectado / Aguardando QR / Desconectado | Admin | `liveStatus` da Evolution, não o texto do banco | Sem env → Conectar bloqueado + banner | `whatsapp-session-card.tsx` |
| Lista | `configured` | Env Evolution preenchida | Admin | `isConfigured()` (URL + APIKEY) | Sem env → aviso; QR/disconnect bloqueados | `evolution-baileys-provider.ts` |
| Lista | `liveStatus` | Estado na Evolution | Admin | `GET connectionState` no `list`/`status` | Sync `ChannelConnection.status` quando mapeável | `whatsapp-service.ts` |
| Botão | Conectar | Parear WhatsApp Web | Admin | Abre dialog + `GET /qr`; poll `GET /status` ~3s até `open` ou 60s **só depois de QR/pairing**; com imagem, poll `GET /qr?fresh=1` ~15s (1 connect Evolution, sem espera 25s) e botão **Atualizar QR**; timer 60s reinicia quando a imagem muda | Só `evolution_baileys`; 409 nos outros. Cache QR 20s. Evolution parada → 503 `UNAVAILABLE` no dialog + Tentar de novo (não “Aguardando conexão…”). `/status` continua 200 com `detail=unreachable` | `whatsapp-session-card.tsx`, `.../qr/route.ts`, `evolution-baileys-provider.ts`, `evolution-qr-cache.ts` |
| Botão | Desconectar | Logout sessão | Admin | `DELETE /instance/logout/:name` + CSRF; some o QR | Só Baileys; Evolution 400/404 = já off | `.../disconnect/route.ts` |
| Accordion | Nova conexão | Cadastro canal | Admin | POST cria row; DevMock já `open`. Accordion em estado React (não `<details>`, evita hydration) | Secrets nunca reexibidos (`secretStatus` na API) | `app/api/connections/route.ts` |
| Accordion | Injetar inbound DEV | Mensagem fake | Admin | `POST /api/dev/mock-inbound` | Só development; não envia WhatsApp | `app/api/dev/mock-inbound/route.ts` |

### 6.9 Ficha do condomínio

`/condominios/[id]`: hub. Header + métricas reais (counts dos arrays já retornados) + cadastro (nome, CNPJ 14 dígitos, endereço, cidade/UF, observação) + abas Contatos, Chamados, Documentos, Comunicações, Prazos (prazos vêm de `tickets.deadlines` abertos; empty se não houver). PATCH cadastral só admin. Contato com condomínio **entra no fluxo**: próximas mensagens daquele telefone **ou do LID WhatsApp já gravado no cadastro** abrem triagem sem identificar de novo. No cadastro, se a Evolution tiver **um** chat `@lid` cujo pushName casa com o nome do contato (primeiro token, ≥4 letras), o alias LID é gravado em `ContactIdentity` e conversas não vinculadas daquele LID entram no fluxo.

### 6.10 Auditoria

Tabela `AuditEvent`. Ações: criar/editar usuário, reset senha, condomínio, contato, triagem, chamado, `document.create`, `message.send` / `message.send_failed`. Sem `passwordHash`/`passwordOnce`. `GET /api/audit` admin.

### 6.11 Interface (v0.9.0 — Workspace operacional)

- Shell: grupos **Operação** (Visão, Atendimento, Triagem*, Não vinculados*, Chamados, Prazos, Documentos, Condomínios) e **Administração*** (Equipe, Conexões). Item ativo com fundo navy suave + barra 2px + `aria-current`. Badges só se count > 0. WhatsApp + usuário no rodapé. Header h-12. Main **full-bleed** em Visão, Inbox, Triagem, Não vinculados, Chamados e Prazos. Mobile: admin `Início | Inbox | Triagem | +`; funcionário `Início | Inbox | Chamados | +`. `+` (`MoreSheet`) não esconde Chamados/Prazos/Triagem.
- Design system: tokens atuais (`#f5f6f8` / `#1b3a4b` / Inter / Fraunces só wordmark). `SectionTabs`, `ExpandableRow`, `ContextSummary`, `ApprovalPanel`. Motion 150–200ms + `prefers-reduced-motion`.
- Visão (`/`): cada bloco = número + significado + ação, **somente se count>0**. Fontes: `GET /api/dashboard`. Admin: não vinculados, triagem, sem responsável, prazos, rascunhos. Funcionário: sem triagem/não vinculados. Sem gráfico e sem KPI inventado.
- Login: cartão institucional; 401 genérico; 429; erro de rede; `?expired=1` se o proxy redirecionar de rota autenticada (não da Visão `/`). Sem “esqueci senha”.
- Inbox: lista limpa; contexto progressivo (contato → condomínio → chamado → triagem; “Mais informações”); composer: Enviar **ou** Salvar rascunho / Enviar para aprovação.
- Densidade: `html { font-size: 14px }`.
- Não vinculados: fila de identidade; confirmação explícita nome+telefone+condo antes do enroll.
- Triagem: split FILA | DECISÃO; contato/condo só leitura.
- Chamados: Quadro e Lista; card com prazo se houver Deadline.
- Ficha: abas + rail + timeline única.
- Documentos: lista com contexto; summary = filtro de condomínio.
- Condomínio: hub com abas.
- Equipe: coluna Chamados (abertos atribuídos). Sem último acesso.
- Conexões: mock só em development.
- Fraunces só no wordmark Juricon. Sem glass/gradiente/neon/IA no chrome. Sem `/sindico` e sem `/ia`.

## 7. Regras de negócio

1. Mensagem inbound de **contato com condomínio** → conversa + item de triagem. Sem Ticket automático. Número **sem** esse cadastro → conversa + mensagem, **sem** TriageItem (tela Não vinculados).
2. Número desconhecido → conversa `unidentified` com `peerPhoneE164` estável (E.164 real ou placeholder LID `+999…`). **Não** cria `Contact` sozinho. O mesmo peer na mesma conexão **não** abre thread nova. Cadastro (Condomínios ou `enroll`) grava alias em `ContactIdentity` (LID e variante BR 8/9) **uma vez**; as próximas mensagens são reconhecidas sozinhas. Se o peer era LID, passa a gravar o telefone do contato. A UI **não** mostra `+999…` como se fosse o número do WhatsApp. Se o webhook vier só com `@lid` (sem telefone), o ingest (e a abertura da thread / Vincular) tenta resolver o PN em `findChats` da Evolution; se achar, promove `peerPhoneE164`. A foto de perfil é baixada no servidor (`peerAvatarKey`, TTL 24h) e servida em `/api/files/avatars/…`. `pushName` do webhook, quando existir, grava `Conversation.peerDisplayName` (rótulo de UI; **não** autoriza nada). No enroll, o número real do WhatsApp **vira** `Contact.phoneE164` (campo travado na UI); número antigo permanece em identity.
3. `waMessageId` único: replay é sucesso idempotente (`created: false`).
4. Promover exige contato com condomínio, categoria e prioridade. `assignedToId` é opcional. Status triagem `promovido`. A triagem **não** identifica contato.
5. Chamado manual: somente admin. Responsável opcional.
6. Mensagem pública de quem pode enviar (`podeResponderCliente` e não `apenasRascunho`, ou admin) chama `WhatsAppProvider.send` / `sendMedia` no mesmo POST (`sendStatus` sent ou failed). Funcionário `apenasRascunho` + `podeResponderCliente` grava `visibility=publica` `sendStatus=draft` (não 403) para o admin despachar. Sem `podeResponderCliente` → 403. `POST /api/messages/:id/approve` envia `failed` ou `draft`. Citação: `replyToId` + `quotedWaMessageId` quando existir.
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
17. Telas de chat (Inbox, Não vinculados, Triagem análise, ficha do chamado) **refetch** lista e/ou mensagens a cada 3s enquanto a aba está em foco (`lib/client/live-poll.ts`). Sem SSE/websocket. Composer local não é limpo pelo poll.

## 8. Como usar o sistema (guia do dia a dia)

1. Copiar `.env.example` → `.env` e preencher Postgres `"PORTAL-JURIDICO"` + `SEED_ADMIN_PASSWORD`.
2. `pnpm install`, `pnpm prisma migrate deploy` (ou `migrate dev`), `pnpm db:seed`. Para esvaziar cadastros/triagem/chamados sem apagar o admin: `pnpm db:reset-operacao` e depois `pnpm db:seed` só se o admin precisar ser regravado (`seed.ts` **não** recria demo).
3. `pnpm dev --port 3010` e abrir `/login`. Menu à esquerda em **Operação** e **Administração**; no celular, Início / Inbox / Triagem (admin) ou Chamados (funcionário) e **+** (Prazos, Documentos, Condomínios, etc.).
4. Login seed **somente** `admin@juricon.local`. Senha em `SEED_ADMIN_PASSWORD` no `.env` local (não documentada aqui). Funcionário, condomínio e contato você cria nas telas (Equipe / Condomínios). **Não** rode `tests/ingest` nem `tests/escritorio` com `DATABASE_URL` no banco `"PORTAL-JURIDICO"` (os testes abortam). Para esses arquivos, use outro database (ex. `PORTAL-JURIDICO-TEST`).
5. Admin: Condomínios (lista e ficha `/condominios/[id]`) → contatos (nome, telefone **mascarado**, cargo, e-mail; foto se houver). Esse cadastro é **uma vez**. Conexões → WhatsApp Web. Em `/atendimento` **Enviar** manda no WhatsApp (texto, arquivo ou áudio). **Responder** cita a mensagem. Com a Inbox (ou Não vinculados) aberta, a mensagem do cliente **aparece sozinha em cerca de 3 segundos** — não precisa atualizar o navegador. Lista e thread mostram **foto de perfil** do WhatsApp quando disponível (senão iniciais do nome). Número ainda não cadastrado cai em **Não vinculados** (`/nao-vinculados`), não na triagem. Lá o admin vê a fila (nome, foto, hora e preview), conversa na coluna do meio e, se quiser, **Vincular ao fluxo** no painel Identidade. Ao abrir o drawer, o sistema tenta obter o celular na Evolution; se vier, o telefone já aparece travado. Com WhatsApp **Conectado** e sem número, use **Puxar do WhatsApp** ao lado do Telefone (mesmo `enrich-peer`). Isso abre **triagem**, não chamado. Se o WhatsApp/Evolution não liberar o número, o item usa “Contato WhatsApp” / iniciais e o telefone continua obrigatório para vincular. Dá para **responder mesmo assim** (via `@lid`). Dá para escolher um contato já cadastrado no condomínio (o número do WhatsApp **não** é trocado pelo do cadastro se o peer já tem PN).
6. Triagem: na fila à esquerda, selecione a solicitação — a análise abre à direita (categoria/prioridade/responsável + **Promover a chamado**). Deep link `/triagem/[id]` usa o mesmo painel. Contato e condomínio já aparecem (só leitura). Resposta ao WhatsApp continua na Inbox ou na ficha do chamado. Funcionário não vê Triagem nem Não vinculados (API 403).
7. Chamados (`/chamados`): **Quadro** ou **Lista** (`?view=lista`). No celular, escolha o status nos chips. Clique no card abre a ficha; no desktop arrastar ou menu **Mover para** muda o status (PATCH). Filtros compactos + avançados recolhidos. Ficha `/chamados/[id]` em abas Resumo / Atividade / Documentos / Comunicação. **Enviar arquivo** e **Adicionar prazo** abrem dialog. Funcionário vê e move só os seus.
8. `/documentos`: lista com título, tipo, condomínio, chamado e data. Filtro de condomínio (o summary não é mais a tela). **Novo documento** → tipo, título, para que serve e arquivo → **Salvar documento**. Preview no drawer. **Enviar WhatsApp** só se o documento estiver vinculado a um chamado.
9. Equipe: **Novo usuário** no drawer; coluna **Chamados** = atribuídos não resolvidos; editar flags no drawer; **Redefinir senha** (copia uma vez; sessões antigas caem). Conexões: **Conectado** / **Aguardando QR** / **Desconectado**; **Conectar** abre o QR (atualiza sozinho ~20s; se o WhatsApp recusar, espere a imagem mudar ou **Atualizar QR**). Se o dialog disser que a Evolution não está no ar: `docker compose up -d` na pasta do portal e **Tentar de novo**. Mock só no accordion Desenvolvimento (notebook).
10. Visão (`/`): cada linha de Agora só aparece se a contagem for > 0 (triagem, não vinculados, rascunhos, prazos…). Clique o verbo para ir à fila. Minha operação lista os seus chamados. Prazos também estão no menu `/prazos`.
11. VPS: hostname do Cloudflare Tunnel + `docs/deploy-vps.md`. Telas iguais; não abrir Evolution na internet.

O síndico **não** tem login neste sistema.

## 9. Checklist de validação

- [ ] `GET /api/health` e `/api/health/ready`
- [ ] Login admin; `/api/auth/me` sem hash
- [ ] Funcionário 403 em `/api/triage` e em ticket alheio
- [ ] Inbound mock de número **sem** cadastro → conversa **sem** triagem, **sem** ticket; aparece em `/nao-vinculados`
- [ ] Inbound de contato **com** condomínio → triagem com nome e condomínio; 2ª mensagem **não** pede identificar
- [ ] Promover com ou sem responsável
- [ ] Inbox Enviar (DevMock/`open`) grava `sent` e `sentToWhatsApp`; nota interna não chama o provider; `apenasRascunho` grava rascunho público (`awaitingApproval`), não 403
- [ ] Funcionário 403 em `/api/audit` e em chamado sem responsável alheio
- [ ] Reset de senha pelo admin gera `passwordOnce` e derruba sessão
- [ ] `GET /api/documents/summary` lista condomínios com count 0; escopo do funcionário (só atribuído) respeitado
- [ ] `POST /api/documents` exige kind/title/purpose/arquivo (422); funcionário sem ticket 403; admin grava ficha no Postgres
- [ ] `/documentos` Novo documento: lista/preview mostram título e tipo após F5 (sem localStorage)
- [ ] Documento `stored`; download autenticado
- [ ] `docker compose config` (Evolution ≠ PORTAL-JURIDICO)
- [ ] Visão `/`: Não lidas ≠ tamanho da atividade; não vinculados na faixa AGORA; WhatsApp só no header
- [ ] Conectar gera imagem (não 422 “QR ainda não gerado”; log Evolution sem `microsoft-standard-WSL2` no Browser)
- [ ] Dialog QR: com painel aberto >20s a imagem muda (ou **Atualizar QR** pede `?fresh=1`); scan com QR recente → CONECTADO
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
- [ ] `/chamados` Quadro e Lista; card com prazo se houver Deadline; PATCH status ao mover persiste após F5; teto 50
- [ ] `/chamados/[id]` abas Resumo/Atividade/Documentos/Comunicação; timeline com tipo+hora+autor; prazos no header
- [ ] `/prazos` lista overdue/dueSoon reais; concluir persiste
- [ ] `/nao-vinculados`: confirmação nome+condo antes do enroll; enroll → triagem (não ticket)
- [ ] Visão: nenhum número órfão; rascunhos/prazos/triagem só se count>0
- [ ] Mobile: 4 slots por papel; `+` alcança Chamados, Prazos e Triagem
- [ ] `/conexoes` em production sem accordion Desenvolvimento / mock
- [ ] Equipe: coluna Chamados sem senha e sem “último acesso”
- [ ] Sem `/ia`, sem portal do síndico, sem KPI fake
- [ ] `/nao-vinculados`: fila com hora/preview/origem; CTA **Vincular ao fluxo**; enroll → triagem (não ticket)
- [ ] Webhook com `pushName` grava `Conversation.peerDisplayName`; lista LID usa esse nome ou “Contato WhatsApp”
- [ ] `/chamados/[id]` abas + rail contexto; Enviar arquivo abre dialog; upload só após Enviar
- [ ] Visão: blocos de ação só se count>0; Minha operação; prazos também em `/prazos`
- [ ] Não vinculados: CTA **Vincular ao fluxo**; enroll → triagem
- [ ] Triagem: split lista + análise; Promover a chamado primario
- [ ] Após `pnpm db:reset-operacao`: Equipe só admin; listas de condomínio/triagem/chamados/inbox vazias; sem canal `dev_mock`
- [ ] Inbox/Não vinculados/Triagem/ficha do chamado: mensagem inbound aparece nas bolhas (e prévia da lista) em ~3s **sem F5**; texto no composer permanece
- [ ] `/nao-vinculados` Vincular: se Evolution tiver PN do chat LID, telefone vem travado; senão campo obrigatório mascarado
- [ ] Inbox/Não vinculados/triagem/ficha: foto de perfil quando `peerAvatarKey` existe; senão iniciais do nome WhatsApp
- [ ] Poll 3s **não** dispara download de foto de novo (TTL 24h / `peerAvatarFetchedAt`)
- [ ] Máscara: digitar `38998034252` → `+55 (38) 99803-4252` nos formulários de contato
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
