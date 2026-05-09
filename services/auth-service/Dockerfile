# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace files first for better layer caching
COPY package*.json ./
COPY shared/types/package.json ./shared/types/
COPY services/auth-service/package*.json ./services/auth-service/

# Install only production deps
RUN npm install --omit=dev --workspace=@chat/auth-service --include-workspace-root

COPY shared/types ./shared/types
COPY services/auth-service ./services/auth-service

# ── Runtime stage ──
FROM node:20-alpine AS runtime
WORKDIR /app

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/shared ./shared
COPY --from=builder --chown=nodejs:nodejs /app/services/auth-service ./services/auth-service

USER nodejs
WORKDIR /app/services/auth-service

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "src/index.js"]
