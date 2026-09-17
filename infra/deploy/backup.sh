#!/usr/bin/env bash
# Dump Juricon + Evolution + tarball de uploads. Não versionar a pasta de saída.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR:-$ROOT/backups}/$STAMP"
mkdir -p "$OUT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "pg_dump PORTAL-JURIDICO → $OUT/juricon.sql"
"${COMPOSE[@]}" exec -T juricon-postgres \
  pg_dump -U juricon -d PORTAL-JURIDICO --no-owner --no-acl > "$OUT/juricon.sql"

echo "pg_dump evolution → $OUT/evolution.sql"
"${COMPOSE[@]}" exec -T evolution-postgres \
  pg_dump -U evolution -d evolution --no-owner --no-acl > "$OUT/evolution.sql"

echo "uploads → $OUT/uploads.tar.gz"
"${COMPOSE[@]}" exec -T juricon-app tar -C /app -czf - uploads > "$OUT/uploads.tar.gz"

echo "ok $OUT"
