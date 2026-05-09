FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY shared/types/package.json ./shared/types/
COPY services/notification-service/package*.json ./services/notification-service/

RUN npm install --omit=dev --workspace=@chat/notification-service --include-workspace-root

COPY shared/types ./shared/types
COPY services/notification-service ./services/notification-service

FROM node:20-alpine AS runtime
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/shared ./shared
COPY --from=builder --chown=nodejs:nodejs /app/services/notification-service ./services/notification-service

USER nodejs
WORKDIR /app/services/notification-service

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3004/health || exit 1

CMD ["node", "src/index.js"]
