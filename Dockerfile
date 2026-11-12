# ==============================================================================
# Stage 1: Builder - kompiliert Frontend (Vite) und Backend (TypeScript)
# ==============================================================================
FROM node:26-alpine AS builder

WORKDIR /app

# Erst nur package*.json kopieren, damit Docker die Dependencies cachen kann
COPY package.json package-lock.json ./
RUN npm ci

# Restlichen Quellcode kopieren und bauen
COPY . .
RUN npm run build && npm run server:build

# ==============================================================================
# Stage 2: Runner - schlankes Produktions-Image ohne Build-Tools
# ==============================================================================
FROM node:26-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/wichteln.db

# Nur Produktions-Dependencies installieren (kein Vite, TypeScript, Playwright etc.)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Gebautes Frontend (dist/client) und Backend (dist/server) aus Stage 1 kopieren
COPY --from=builder /app/dist ./dist

# Daten-Ordner fuer SQLite anlegen und Rechte an den nicht-privilegierten User "node" geben
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/status || exit 1

CMD ["node", "dist/server/index.js"]
