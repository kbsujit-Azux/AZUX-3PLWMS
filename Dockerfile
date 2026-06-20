# ---- Build stage ----------------------------------------------------------
FROM oven/bun:1.1 AS builder
WORKDIR /app

# Install dependencies (cached layer)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy source and build for Node target
COPY . .
# Use the Node-target Vite config for the build
RUN cp vite.config.node.ts vite.config.ts
RUN bun run build

# ---- Runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

# Copy the server.js wrapper and build output
COPY server.js .
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080

# Healthcheck — adjust path if you add a /api/health route
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

# Node.js server wrapper for TanStack Start
CMD ["node", "server.js"]