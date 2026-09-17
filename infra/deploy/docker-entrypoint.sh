#!/bin/sh
set -eu
cd /app
pnpm prisma migrate deploy
exec pnpm start --hostname 0.0.0.0 --port 3000
