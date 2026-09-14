# Juricon (Portal Jurídico Condominial)

Escritório interno. Documentação oficial: [`DOCUMENTACAO-SISTEMA.md`](./DOCUMENTACAO-SISTEMA.md).

```bash
pnpm install
# criar database PostgreSQL "PORTAL-JURIDICO"
pnpm prisma migrate deploy
pnpm db:seed
pnpm dev --port 3010
```

Opcional WhatsApp Web (não oficial): `docker compose up -d` — ver [`infra/evolution/README.md`](./infra/evolution/README.md). Sem Docker, use DevMock em Conexões.

Login seed: `admin@juricon.local` e `funcionario@juricon.local` — senhas em `SEED_*` no `.env` (não commitado).
