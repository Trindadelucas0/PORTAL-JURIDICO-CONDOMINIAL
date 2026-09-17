# syntax=docker/dockerfile:1
FROM node:22-alpine
RUN apk add --no-cache libc6-compat openssl wget
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm prisma generate && pnpm build

RUN mkdir -p /app/uploads \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && chown -R nextjs:nodejs /app/.next /app/uploads /app/prisma \
  && chmod +x /app/infra/deploy/docker-entrypoint.sh

USER nextjs
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["./infra/deploy/docker-entrypoint.sh"]
