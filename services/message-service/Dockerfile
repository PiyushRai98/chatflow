FROM node:20-alpine AS builder
WORKDIR /app

# sharp needs build deps
RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./
COPY shared/types/package.json ./shared/types/
COPY services/message-service/package*.json ./services/message-service/

RUN npm install --omit=dev --workspace=@chat/message-service --include-workspace-root

COPY shared/types ./shared/types
COPY services/message-service ./services/message-service

FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache vips && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/shared ./shared
COPY --from=builder --chown=nodejs:nodejs /app/services/message-service ./services/message-service

USER nodejs
WORKDIR /app/services/message-service

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3003/health || exit 1

CMD ["node", "src/index.js"]
