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
