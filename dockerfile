# Stage 1: Build Stage (Alpine-based)
FROM node:20-alpine AS builder

ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npx prisma generate

RUN npm run build


# Stage 2: Production Stage (Alpine-based)
FROM node:24-alpine

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=5000

# ── Cache warm-up on container boot ──────────────────────────────────────────
# The instrumentation.ts hook (compiled into .next/) runs once when the Node
# server starts. With WARM_CACHE_ON_BOOT=1 it fires the warmer in the
# background after boot so the first real user request hits warm Upstash
# instead of paying the Postgres miss.
#   WARM_CACHE_ON_BOOT=1            → enable
#   WARM_CACHE_SCOPE=all            → also warm per-org caches (omit for globals-only)
#   WARM_CACHE_FORMS=1              → also pre-load every form's full structure
ENV WARM_CACHE_ON_BOOT=1
ENV WARM_CACHE_SCOPE=all

WORKDIR /app

COPY --from=builder /app/.env ./.env
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./ 
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.mjs ./

EXPOSE 5000

CMD ["npm", "run", "start"]
