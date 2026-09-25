# Evolution API (WhatsApp Web / Baileys) — isolada do Juricon

Este compose (arquivo base) sobe **somente** Redis + Postgres interno da Evolution + Evolution API.

Não use o database PostgreSQL `"PORTAL-JURIDICO"` aqui.

- **Notebook:** Next no host (`pnpm dev --port 3010`); `docker compose up -d` publica Evolution em `localhost:8080`.
- **VPS:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` — Next e Postgres Juricon no Compose; Evolution **sem** porta no host. Guia: [`docs/deploy-vps.md`](../../docs/deploy-vps.md).

Imagem: `evoapicloud/evolution-api:v2.2.3` (o namespace antigo `atendai/evolution-api` está gated no Docker Hub).

## Subir

Na pasta `PORTAL JURIDICO CONDOMINIAL`:

```bash
docker compose config
docker compose up -d
```

Placeholders em `.env` / `.env.example` (valores vazios de `EVOLUTION_API_URL` / `EVOLUTION_APIKEY` → erro **"Evolution Baileys não configurada"** no app):

- `EVOLUTION_API_URL=http://localhost:8080`
- `EVOLUTION_APIKEY` (mesmo valor de `AUTHENTICATION_API_KEY` no compose)
- `EVOLUTION_WEBHOOK_SECRET` (validado pelo app; fail-closed se vazio)
- `WEBHOOK_GLOBAL_ENABLED=false` no compose: o webhook global desta imagem **não** manda o secret e a Evolution retenta 401 para sempre. O inbound usa só o webhook da instância (`POST /webhook/set/{instância}` com `x-evolution-secret`).
- Ao **Obter QR** / **Atualizar status**, o app reaplica esse webhook da instância.
- `EVOLUTION_INSTANCE=juricon`
- `EVOLUTION_PORT` se 8080 estiver ocupada
- `EVOLUTION_WEBHOOK_URL` padrão `http://host.docker.internal:3010/api/webhooks/evolution` (Next em `pnpm dev --port 3010`)

Reinicie o Next após alterar o `.env` para carregar as variáveis.

## Controle pelo app (`/conexoes`)

Admin, conexão `evolution_baileys`:

1. **Atualizar status** → `GET /api/connections/:id/status` (consulta Evolution `connectionState` e sincroniza `ChannelConnection.status` quando possível).
2. **Obter QR** → cria a instância se faltar e faz poll em `GET /instance/connect/:name` (também aceita cache do webhook `QRCODE_UPDATED`, TTL **20s**). No app: `/conexoes` → **Conectar**; com o dialog aberto, `GET /qr?fresh=1` a cada ~15s e botão **Atualizar QR**. Não precisa de telefone.
   - `CONFIG_SESSION_PHONE_VERSION=2.3000.1043857760` no compose (sobrescreve o `.env` interno da imagem `2.3000.1015901307`, que deixava o socket em loop sem QR). Atualizar se o Baileys publicar versão nova. **Não** use `22.5.0`.
   - Nesta imagem o 3º item do browser é sempre `os.release()`. No Docker Desktop/WSL isso era `*-microsoft-standard-WSL2`, o WhatsApp recusava a sessão e o connect voltava `{count:0}` (422 no app). O compose monta `infra/evolution/patch-os-release.cjs` via `NODE_OPTIONS` para reportar `10.0.22621`, com `CONFIG_SESSION_PHONE_CLIENT=Windows`.
   - A mesma imagem recusa envio para JID `@lid` (`whatsappNumber` devolve `exists: false` e o HTTP fica 400). A checagem está copiada em cada bundle de `dist`. `patch-lid-send.cjs` (também no `NODE_OPTIONS`) reescreve todas essas cópias no boot. Telefone que o WhatsApp não reconhece continua recusado.
   - Sem QR após ~25s: 422. Recrie o container (`docker compose up -d --force-recreate evolution-api`) depois de mudar o patch.
3. **Desconectar** → `POST /api/connections/:id/disconnect` (CSRF) → `DELETE /instance/logout/:name`.

Não é necessário criar a instância manualmente na Evolution Manager se o app estiver configurado: o ensure ocorre no fluxo de QR.

Rótulo na UI: **WhatsApp Web (não oficial)**. Risco de banimento da conta. Não é WhatsApp Cloud oficial.

## Se o Docker não estiver rodando

O escritório opera, mas **Conectar** no `/conexoes` não gera QR: o app responde 503 (“Evolution API não está no ar”) no dialog. Suba `docker compose up -d` e use **Tentar de novo**. Sem o compose, inbound/envio Baileys também falham.
