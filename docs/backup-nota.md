# Backup — nota fase 0

Backup **não está automatizado** neste app.

Recomendação operacional (fora do código):

- Dump periódico do Postgres `"PORTAL-JURIDICO"` (`pg_dump`).
- Pasta `uploads/` (anexos em disco local) deve entrar no mesmo ciclo de cópia.
- Restaurar migrate + dump; não usar `db push` como mecanismo de produção.

Não versionar dumps nem `.env`.
