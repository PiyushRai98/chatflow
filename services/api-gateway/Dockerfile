FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY services/api-gateway/package*.json ./services/api-gateway/

RUN npm install --omit=dev --workspace=@chat/api-gateway --include-workspace-root

COPY services/api-gateway ./services/api-gateway

FROM node:20-alpine AS runtime
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/services/api-gateway ./services/api-gateway

USER nodejs
WORKDIR /app/services/api-gateway

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
