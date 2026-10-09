# ==============================================================================
# Ottobon Templates Hub — Production Dockerfile
# Optimized for Ubuntu Linux VPS Server
# Base: Node 20 Alpine (Ultra-lightweight ~50MB, fast pull, secure)
# ==============================================================================

FROM node:20-alpine

# Metadata
LABEL maintainer="Ottobon"
LABEL description="Ottobon 28 Website Templates Dashboard"

# Set runtime environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DOCKER_CONTAINER=true

# Set working directory inside container
WORKDIR /app

# Cache dependencies layer (future-proofs if packages are added)
COPY --chown=node:node package*.json ./
RUN npm install --omit=dev --no-audit --no-fund || true

# Copy all monorepo application files
COPY --chown=node:node . .

# Run container process as non-root user for security isolation
USER node

# Expose HTTP port (3000)
EXPOSE 3000

# Zero-dependency healthcheck probe (returns HTTP 200 from server.js /health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the unified referer-aware HTTP server
CMD ["node", "server.js"]
