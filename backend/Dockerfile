# ── Backend Dockerfile (Cloud Run) ─────────────────────────────
FROM node:20-alpine

# Security: run as non-root user
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy deps first for better layer caching
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=appuser:appgroup src ./src

USER appuser

# Cloud Run requires port 8080
ENV PORT=8080
EXPOSE 8080

# Graceful shutdown support
STOPSIGNAL SIGTERM

CMD ["node", "src/server.js"]
