# Juricon — Documentação do Sistema

| Item | Valor |
|------|--------|
| Versão do sistema | 0.2.6 — Envio WhatsApp 422 |
| Última atualização | 14/09/2026 (envio: status vivo Evolution + erro sendText na UI) |
| Fonte oficial | Este arquivo |
| Repositório | pasta `PORTAL JURIDICO CONDOMINIAL` (GitHub PORTAL-JURIDICO-CONDOMINIAL) |

## 1. Como usar este documento

Fonte única de comportamento. Não descreve o protótipo da pasta pai (`condominio-advogada`) nem o questionário `perguntas/`.

## 2. Tecnologias utilizadas

- Next.js 16 (App Router) + React + TypeScript
- Tailwind CSS 4
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

## 3. Mapa de telas / conexões

```
/login → cookie sessão
  → / dashboard (KPIs + prazos vencidos)
  → /atendimento Inbox (admin todas; funcionario via tickets atribuídos)
  → /triagem (admin) identificar / arquivar / promover
  → /chamados lista → /chamados/[id] ficha
  → /prazos
  → /documentos
  → /conexoes (admin)
  → /condominios cadastros
  → /equipe (admin, criar/desativar/flags)
```

Inbound: webhook Evolution ou `POST /api/dev/mock-inbound` → Conversation + Message + TriageItem. **Não cria Ticket.** Admin promove na triagem.

## 4. Papéis e acesso

| Papel | Acesso |
|-------|--------|
| admin | Todas as telas e APIs; cria chamado manual; aprova rascunho; cadastra equipe |
| funcionario | Login, condomínios GET/POST, inbox das conversas dos **seus** chamados, chamados/prazos/documentos **só atribuídos**. **403** em triagem, conexões, equipe, ticket/arquivo alheio. Rascunho se `apenasRascunho` |

Autorização só no servidor (`requireSession` / `requireAdmin` / `requireTicketAccess`). Menu esconde rotas; isso **não** autoriza.

IDOR: recurso existente mas alheio → **403**. Inexistente → **404**. Sem 404 falso para mascarar ticket de outro usuário do mesmo escritório.

Single-tenant: um escritório, sem `companyId`. Contrato não permite SaaS multi-escritório.

## 5. Índice de rotas e “onde olhar no código”

| Rota UI | API | Código |
|---------|-----|--------|
| `/login` | `POST /api/auth/login` | `app/login/page.tsx`, `app/api/auth/login/route.ts` |
| `/` | `GET /api/dashboard` | `app/(app)/page.tsx` |
| `/atendimento` | `GET /api/conversations`, messages | `app/(app)/atendimento/page.tsx` |
| `/triagem` | `GET/PATCH /api/triage` | `app/(app)/triagem/page.tsx` |
| `/chamados` | `GET/POST /api/tickets` | `app/(app)/chamados/page.tsx` |
| `/chamados/[id]` | `GET/PATCH /api/tickets/:id`, messages, approve | `app/(app)/chamados/[id]/page.tsx` |
| `/prazos` | `GET/POST/PATCH /api/deadlines` | `app/(app)/prazos/page.tsx` |
| `/documentos` | `GET/POST /api/documents`, `GET /api/files/...` | `app/(app)/documentos/page.tsx` |
| `/conexoes` | `GET/POST /api/connections`, `GET .../qr`, `GET .../status`, `POST .../disconnect`, webhook, mock | `app/(app)/conexoes/page.tsx`, `whatsapp-service.ts`, `evolution-baileys-provider.ts` |
| `/condominios` | `/api/condominiums`, `/api/contacts` | `app/(app)/condominios/page.tsx` |
| `/equipe` | `GET/POST/PATCH /api/team` | `app/(app)/equipe/page.tsx` |
| — | `POST /api/messages/:id/approve` | `app/api/messages/[id]/approve/route.ts` |
| — | `GET /api/health`, `/api/health/ready` | `app/api/health/` |
| — | `POST /api/webhooks/evolution` | `app/api/webhooks/evolution/route.ts` |

Guards: `lib/auth/guards.ts`, `lib/auth/ticket-access.ts`. Serviços: `lib/services/*`. Índice futuro: `lib/search/document-index-port.ts` (no-op). Canais: `lib/channels/`.

**Não existe** `/sindico`, botão de indexar IA, LLM.

## 6. Telas e fluxos (fichas)

### 6.1 Login

| Aba / seção | Campo | O que é | Obrigatório | Quem preenche | De onde vem | Para onde conecta | Como funciona | Regra / bloqueio | Onde olhar no código |
|-------------|-------|---------|-------------|---------------|-------------|-------------------|----------------|------------------|----------------------|
| Formulário | E-mail | Identificador | Sim | Usuário | Digitação | Sessão | Cookie httpOnly | 401 genérico | `app/login/page.tsx` |
| Formulário | Senha | Segredo | Sim | Usuário | Digitação | Hash bcrypt | Rate limit | Não revela se e-mail existe | `app/api/auth/login/route.ts` |

### 6.2 Inbox

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Lista | Conversas | Thread | — | Admin todas; funcionario só conversas com ticket `assignedToId=eu` | 403 se conversa alheia | `atendimento-service.ts` |
| Composer | Resposta | Pública | Condicional | Envia via WhatsAppProvider ou grava draft | Baileys: `getStatus` vivo (`open`); contato identificado; `apenasRascunho` → draft; Evolution `!ok` → 422 com causa | `postMessage`, `evolution-send.ts` |
| Composer | Nota interna | Só escritório | Não | Grava `visibility=interna` | **Nunca** envia ao WhatsApp | `postMessage` |

### 6.3 Triagem

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Card | Identificar | Vincula contato | Sim para promover | PATCH `identify` | Contato existente | `cadastro-service.ts` |
| Card | Categoria / prioridade / responsável | Dados do chamado | Sim para promover | PATCH `promote` | Contato identificado + condomínio no contato | `ticket-service.ts` |
| Card | Arquivar | Fecha item | Não | status `arquivado` | — | `app/api/triage/[id]/route.ts` |

### 6.4 Chamados

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Lista | Protocolo | Identificador `AAAA-NNNN` | — | GET filtrado no servidor | Funcionario só os seus | `ticket-service.ts` |
| Lista | Novo manual | Cria chamado | Admin | POST | Só admin | `app/api/tickets/route.ts` |
| Ficha | Rascunho / aprovar | Envio WA | Condicional | POST messages; admin `approve` | Draft não chama provider; conexão `open` para enviar | `approval-service.ts` |
| Ficha | Docs / prazos | Anexos e vencimentos | Não | POST documents/deadlines | IDOR 403 | `document-service.ts` |

### 6.5 Equipe

| Aba / seção | Campo | O que é | Obrigatório | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|-------|---------|-------------|---------------|------------------|------------|
| Formulário | E-mail / papel / flags | Cadastro | Sim | POST gera senha, hash bcrypt, UI mostra **uma vez** | Não loga senha | `team-service.ts` |
| Tabela | Desativar | Soft flag `ativo` | — | PATCH | Último admin ativo não desativa/rebaixa | `app/api/team/route.ts` |

### 6.6 Documentos

Upload jpeg/png/pdf/áudio (allowlist existente), máx. 8 MB, disco `uploads/`. `ingestStatus=stored`. Download autenticado `GET /api/files/...`. Sem botão de IA.

### 6.7 Prazos

Prazo operacional no chamado (`kind` atendimento/juridico). KPI “Prazos vencidos” no dashboard. **Não** calcula prazo processual oficial.

### 6.8 Conexões (WhatsApp)

| Aba / seção | Campo / ação | O que é | Quem | Como funciona | Regra / bloqueio | Onde olhar |
|-------------|--------------|---------|------|---------------|------------------|------------|
| Lista | `configured` | Env Evolution preenchida | Admin | `isConfigured()` (URL + APIKEY) | Sem env → badge/aviso; QR/disconnect bloqueados | `evolution-baileys-provider.ts` |
| Lista | `liveStatus` | Estado na Evolution | Admin | `GET connectionState` no `list`/`status` | Sync `ChannelConnection.status` quando mapeável | `whatsapp-service.ts` |
| Botão | Atualizar status | Refresh live | Admin | `GET /api/connections/:id/status` | Só admin | `app/api/connections/[id]/status/route.ts` |
| Botão | Obter QR | Parear WhatsApp Web | Admin | `ensureInstance` + poll `GET /instance/connect`; UI `<img>` se base64 | Só `evolution_baileys`; 409 nos outros tipos. Compose: `NODE_OPTIONS` patch `os.release` (WSL) | `.../qr/route.ts` |
| Botão | Desconectar | Logout sessão | Admin | `DELETE /instance/logout/:name` + CSRF | Só Baileys; 409 nos outros | `.../disconnect/route.ts` |
| Form | Nova conexão | Cadastro canal | Admin | POST cria row; DevMock já `open` | Secrets nunca reexibidos (`secretStatus`) | `app/api/connections/route.ts` |

## 7. Regras de negócio

1. Mensagem inbound → conversa + item de triagem. Sem Ticket automático.
2. Número desconhecido → conversa `unidentified` rotulada “não identificado”.
3. `waMessageId` único: replay é sucesso idempotente (`created: false`).
4. Promover exige contato identificado, condomínio no contato, categoria, prioridade, `assignedToId`. Status triagem `promovido`.
5. Chamado manual: somente admin.
6. `apenasRascunho`: mensagem pública vira `draft`; admin `POST /api/messages/:id/approve` chama `WhatsAppProvider.send` / `sendMedia`.
7. Nota interna (`visibility=interna`) nunca chama o provider (nem no approve).
8. Webhook Evolution **fail-closed**: sem `EVOLUTION_WEBHOOK_SECRET` → 401. Compose com `WEBHOOK_GLOBAL_ENABLED=false` (global desta imagem não envia secret e retenta 401). Inbound: webhook da instância com `x-evolution-secret` via `POST /webhook/set/:instance` no `ensureInstance`.
9. DevMock sempre rotulado **DEV**. Cloud = stub “não configurado”. Baileys = “WhatsApp Web (não oficial)”.
10. Domínio fala `WhatsAppProvider`, nunca Evolution/Meta direto nas páginas.
11. Uploads: jpeg/png/pdf/áudio comum; SVG/HTML recusados; máx. 8 MB; disco `uploads/`.
12. `DocumentIndexPort` no-op; sem embedding.
13. Envelope API: `{ data, meta }` ou `{ error: { code, message, details } }`.
14. Paginação `page` + `pageSize` (máx. 50).
15. Envio público Baileys: consulta status vivo da Evolution (não só `ChannelConnection.status` no banco). Sessão ≠ `open` → 422 “WhatsApp Web não está conectado…”. Falha `sendText` → 422 `Evolution recusou envio (HTTP): …` e `sendStatus=failed`.

## 8. Como usar o sistema (guia do dia a dia)

1. Copiar `.env.example` → `.env` e preencher Postgres `"PORTAL-JURIDICO"` + `SEED_ADMIN_PASSWORD`.
2. `pnpm install`, `pnpm prisma migrate deploy` (ou `migrate dev`), `pnpm db:seed`.
3. `pnpm dev --port 3010` e abrir `/login`.
4. E-mails seed **somente demo**: `admin@juricon.local` e `funcionario@juricon.local`. Senhas nas variáveis `SEED_*` do `.env` local (não documentadas aqui).
5. Admin: Condomínios → contatos; Conexões → inbound DEV **ou** WhatsApp Web: `.env` Evolution + `docker compose up -d` (`infra/evolution/README.md`) → `/conexoes` → **Obter QR** (sem telefone) → escanear até `live:open`. Em `/atendimento`, responda na conversa **dessa** conexão (não DevMock). Se Enviar falhar, o banner mostra a causa (sessão ou recusa da Evolution).
6. Triagem: identificar contato (com condomínio) → categoria/prioridade/responsável → **Promover a chamado**.
7. Funcionário: `/chamados` só os seus; responde com rascunho; admin aprova na ficha.
8. `/documentos` e `/prazos` na ficha ou nas listas. Download exige sessão.
9. Equipe: criar usuário, copiar senha provisória na hora, desativar se preciso (não o último admin).

O síndico **não** tem login neste sistema.

## 9. Checklist de validação

- [ ] `GET /api/health` e `/api/health/ready`
- [ ] Login admin; `/api/auth/me` sem hash
- [ ] Funcionário 403 em `/api/triage` e em ticket alheio
- [ ] Inbound mock → conversa + triagem, **sem** ticket
- [ ] Promover → protocolo e responsável
- [ ] Rascunho não envia; approve envia (DevMock)
- [ ] Documento `stored`; download autenticado
- [ ] Prazo vencido no dashboard
- [ ] `docker compose config` (Evolution ≠ PORTAL-JURIDICO)
- [ ] `/conexoes` Baileys: status live, QR imagem, disconnect (com Docker + env)
- [ ] Obter QR gera imagem (não 422 “QR ainda não gerado”; log Evolution sem `microsoft-standard-WSL2` no Browser)
- [ ] `/atendimento` Enviar: 201 com Baileys `open`; 422 explícito se sessão fechada ou Evolution recusar sendText
- [ ] Sem pgvector / DocumentChunk

## 10. Segurança (só o que existe)

- Sessão opaca em cookie httpOnly, SameSite=Lax, Secure em produção
- CSRF: checagem de `Origin` em POST autenticados
- Rate limit in-memory no login e no webhook (processo único)
- Prisma parametrizado + Zod
- IDOR ticket/documento/arquivo no servidor
- Secrets só em env; conexões devolvem `secretStatus: cadastrado`
- Senha de equipe gerada no servidor, bcrypt; não logada
- Proxy Next 16 (`proxy.ts`) redireciona UI sem cookie; APIs ainda validam sessão
- Sem RLS multiempresa (fora do contrato). Role do Postgres local: **UNKNOWN** se o app usa superuser `postgres`

## 11. Deploy / ambiente (sem secrets)

Variáveis (ver `.env.example`): `DATABASE_URL`, `SEED_ADMIN_PASSWORD`, `SEED_FUNCIONARIO_PASSWORD`, `EVOLUTION_API_URL`, `EVOLUTION_APIKEY`, `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_INSTANCE`, `EVOLUTION_PORT`, `EVOLUTION_POSTGRES_PASSWORD` (só o Postgres **interno** da Evolution), `EVOLUTION_WEBHOOK_URL`.

Compose: `docker-compose.yml` na raiz desta pasta (`evoapicloud/evolution-api:v2.2.3` + Redis + Postgres interno Evolution). App Next no host. Backup: `docs/backup-nota.md`. IA futura: `docs/architecture/ai-future.md` (**não implementado**).

## 12. Ao atualizar este documento

Atualizar capa, §2.1, fichas e regras na mesma entrega em que o comportamento mudar. Não gravar senhas.
