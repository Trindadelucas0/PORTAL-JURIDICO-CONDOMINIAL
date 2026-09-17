# Backup

Script na VPS: [`infra/deploy/backup.sh`](../infra/deploy/backup.sh).

Gera, por execução:

- `juricon.sql` — Postgres `PORTAL-JURIDICO` (user `juricon`)
- `evolution.sql` — Postgres interno da Evolution
- `uploads.tar.gz` — anexos do volume `juricon-uploads`

Notebook (Next no host): `pg_dump` do database `"PORTAL-JURIDICO"` + cópia da pasta `uploads/`.

Restaurar: `migrate deploy` + `psql` do dump; não usar `db push`.

Não versionar dumps nem `.env`. Pasta local `backups/` está no `.gitignore`.
