# Juricon (Portal Jurídico Condominial)

Escritório interno. Documentação oficial: [`DOCUMENTACAO-SISTEMA.md`](./DOCUMENTACAO-SISTEMA.md).

```bash
pnpm install
# criar database PostgreSQL "PORTAL-JURIDICO"
pnpm prisma migrate deploy
pnpm db:seed
pnpm dev --port 3010
```

Opcional WhatsApp Web (não oficial): `docker compose up -d` — ver [`infra/evolution/README.md`](./infra/evolution/README.md).

VPS (túnel Cloudflare, um compose): [`docs/deploy-vps.md`](./docs/deploy-vps.md).

Login seed: `admin@juricon.local` — senha em `SEED_ADMIN_PASSWORD` no `.env` (não commitado). Equipe, condomínios e contatos são cadastrados nas telas.

Para zerar operação (triagem, chamados, cadastros) e manter o admin: `pnpm db:reset-operacao`. O seed **não** recria condomínio, funcionário demo nem DevMock.

Testes de integração (`tests/ingest.test.ts`, `tests/escritorio.test.ts`) **recusam** o database `"PORTAL-JURIDICO"`. Aponte `DATABASE_URL` a outro banco (ex. `PORTAL-JURIDICO-TEST`) só para esses testes. Unitários (`tests/unit.test.ts`, `tests/evolution-webhook.test.ts`) não gravam no Postgres.
