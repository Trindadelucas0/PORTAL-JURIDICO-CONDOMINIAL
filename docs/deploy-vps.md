# Deploy Juricon em uma VPS (Cloudflare Tunnel)

Stack numa máquina só: Next + Postgres do escritório (pgvector) + worker da IA + Redis de **jobs** do Juricon + Evolution (Redis e Postgres **dela**). O `juricon-redis` não é cache da inbox. Sem expor 3010/8080/5432 na internet.

Documentação de comportamento: [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md) §11.

## O que sobe

| Serviço | Papel | Público? |
|---------|--------|----------|
| `juricon-app` | Next na porta **3000** do container | Só `127.0.0.1:3010` para o cloudflared |
| `juricon-postgres` | Database `PORTAL-JURIDICO`, user `juricon`, imagem pgvector | Não |
| `juricon-redis` | Broker de jobs da IA (BullMQ). Não é cache da inbox | Não |
| `juricon-worker` | Consome a fila. Sem porta. Sem `EVOLUTION_APIKEY` | Não |
| `evolution-api` | WhatsApp Web (Baileys) | Não (rede Docker) |
| `evolution-postgres` | Só Evolution | Não |
| `evolution-redis` | Fila/cache **só** da Evolution | Não |
| `cloudflared` | Ingress HTTPS | Outbound; não é container deste compose |

Notebook (dev): `docker compose up -d` — Evolution em `localhost:8080`, Next com `pnpm dev --port 3010`. Postgres do Juricon com pgvector: `docker compose up -d juricon-postgres-dev` (host **5433**; o 5432 do Windows não tem `vector`). Ver [`infra/evolution/README.md`](../infra/evolution/README.md).

## Requisitos

- VPS **≥ 4 GB RAM** (Evolution + dois Postgres).
- Docker Compose v2.24+ (`ports: !reset`).
- Túnel Cloudflare apontando para `http://127.0.0.1:3010`.
- Hostname HTTPS (`APP_PUBLIC_URL`), ex. `https://juricon.seudominio.com`.

## Variáveis (VPS)

Copiar `.env.example` → `.env` na pasta do compose. Preencher (não commitar):

- `JURICON_POSTGRES_PASSWORD`
- `JURICON_REDIS_PASSWORD` (broker de job; não reutilizar a senha da Evolution)
- `EVOLUTION_POSTGRES_PASSWORD`
- `EVOLUTION_APIKEY` (igual à Evolution)
- `EVOLUTION_WEBHOOK_SECRET`
- `SESSION_SECRET` (aleatório longo)
- `APP_PUBLIC_URL=https://<hostname-do-túnel>` (sem barra no final)

O `docker-compose.prod.yml` **ignora** `EVOLUTION_API_URL` / webhook do notebook e força:

- Evolution `SERVER_URL=http://evolution-api:8080`
- App `EVOLUTION_API_URL=http://evolution-api:8080`
- Webhook `http://juricon-app:3000/api/webhooks/evolution`

Não coloque o webhook no hostname Cloudflare.

Não defina `SEED_*` de forma permanente na VPS.

## Subir

```bash
cd /caminho/PORTAL-JURIDICO-CONDOMINIAL
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -sS http://127.0.0.1:3010/api/health
curl -sS http://127.0.0.1:3010/api/health/ready
```

Entrypoint do app roda `prisma migrate deploy` e depois `next start`.

## Variante: Next no PM2 + Evolution/Postgres no Docker

Use quando o app Next e o worker rodam no **host** (PM2) e só a stack Evolution + Postgres/Redis do Juricon ficam no compose (ex. `docker-compose.pm2.yml`), com o túnel apontando para `http://127.0.0.1:<JURICON_HOST_PORT>`.

| Onde roda | Quem chama quem | URL / bind |
|-----------|-----------------|------------|
| PM2 (`juricon-app`) | Browser via cloudflared → host | `next start --hostname **0.0.0.0** --port <JURICON_HOST_PORT>` — **não** só `127.0.0.1`, senão o container Evolution não alcança o webhook |
| PM2 | App → Evolution publicada no host | `EVOLUTION_API_URL=http://127.0.0.1:8080` (porta mapeada do `evolution-api`) |
| Container Evolution | Evolution → webhook do Next no host | `EVOLUTION_WEBHOOK_URL=http://172.17.0.1:<JURICON_HOST_PORT>/api/webhooks/evolution` (gateway `docker0`; confira com `ip -4 addr show docker0`) |

`host.docker.internal` só funciona se o serviço `evolution-api` tiver `extra_hosts: host.docker.internal:host-gateway`. O `docker-compose.prod.yml` faz `extra_hosts: !reset []` — nessa variante PM2, prefira **`172.17.0.1`** ou reative `extra_hosts` no override do compose.

Após mudar `.env` ou `ecosystem.config.cjs`:

```bash
cd /caminho/PORTAL-JURIDICO-CONDOMINIAL
export JURICON_PNPM=/caminho/para/pnpm   # se pnpm não estiver no PATH do PM2
export JURICON_HOST_PORT=5559            # opcional; default do ecosystem é 3010
pm2 start ecosystem.config.cjs --update-env
# ou, se o processo já existia com args antigos:
pm2 delete juricon-app 2>/dev/null; pm2 start ecosystem.config.cjs --only juricon-app --update-env
pm2 save
```

Re-registrar webhook na Evolution (admin **Conexões** → **Atualizar QR**, ou qualquer fluxo que chame `syncWebhook`) para a URL nova. Diagnóstico:

```bash
curl -sS http://127.0.0.1:<porta>/api/health
docker exec <evolution-api> node -e "fetch('http://172.17.0.1:<porta>/api/health').then(r=>console.log(r.status))"
# 127.0.0.1:<porta> de *dentro* do container deve falhar; 172.17.0.1 deve retornar 200
```

Mensagem **nova** de um número **sem** contato no condomínio deve aparecer em **Não vinculados** (~3s). QR conectado sozinho não prova o webhook.

## Cloudflare Tunnel (host)

1. Zero Trust → Networks → Tunnels → criar túnel Linux.
2. Instalar `cloudflared` **no host** (systemd), não no compose.
3. Copiar [`infra/cloudflared/config.example.yml`](../infra/cloudflared/config.example.yml): um `hostname` → `http://127.0.0.1:3010`. **Não** criar hostname para a porta 8080.
4. Conferir `APP_PUBLIC_URL` = `https://` + esse hostname (CSRF).

Opcional: Cloudflare Access na frente do hostname (e-mail do escritório).

## Firewall

- SSH só com chave.
- Não abrir 3010, 8080, 5432 no WAN. O túnel sai da VPS; não precisa de 443 de entrada.

## Primeiro admin (sem seed permanente)

O seed (`admin@juricon.local` + canal WhatsApp Web) **não** deve ficar com senha fraca no `.env` permanente da VPS. Seed **não** cria DevMock.

Opção pontual (apague `SEED_*` depois):

```bash
# só a primeira vez, senha forte, depois remover SEED_* do .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -e SEED_ADMIN_PASSWORD='...' juricon-app pnpm db:seed
```

Entre, crie o usuário real em **Equipe** e desative `admin@juricon.local` se não for o login de produção.

## QR WhatsApp

Como no notebook: `/conexoes` → Obter QR. A Evolution fala com o app na rede Docker; o browser só fala com o Next via túnel.

## Backup

```bash
chmod +x infra/deploy/backup.sh
BACKUP_DIR=/var/backups/juricon infra/deploy/backup.sh
```

Cron diário no host. Restaurar: `psql` nos containers + `tar` em `/app/uploads`. Não usar `prisma db push`. Detalhe: [`docs/backup-nota.md`](./backup-nota.md).

## O que não fazer

- Usar Redis como cache da inbox ou publicar porta do `juricon-redis` / `evolution-redis` no host.
- Colocar `EVOLUTION_APIKEY` no `juricon-worker`.
- Publicar Evolution no Cloudflare.
- `docker compose down -v` na VPS (apaga volumes).
- Várias réplicas do Next (rate limit é in-memory).
