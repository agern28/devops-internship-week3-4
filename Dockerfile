# ---- Build/deps stage ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Runtime stage ----
FROM node:24-alpine AS runtime

# Version is baked in at build time so the running container can report it.
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=$APP_VERSION

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

# Run as non-root for security.
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

USER app
EXPOSE 8080

# Container-level healthcheck (Kubernetes probes are the primary mechanism).
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "src/server.js"]
