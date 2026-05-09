FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY shared/types/package.json ./shared/types/
COPY services/chat-service/package*.json ./services/chat-service/

RUN npm install --omit=dev --workspace=@chat/chat-service --include-workspace-root

COPY shared/types ./shared/types
COPY services/chat-service ./services/chat-service

FROM node:20-alpine AS runtime
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/shared ./shared
COPY --from=builder --chown=nodejs:nodejs /app/services/chat-service ./services/chat-service

USER nodejs
WORKDIR /app/services/chat-service

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3002/health || exit 1

CMD ["node", "src/index.js"]
