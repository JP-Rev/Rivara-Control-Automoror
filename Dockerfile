# ---- build del front ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- dependencias del server ----
# En capa aparte para que better-sqlite3 se resuelva una sola vez.
FROM node:22-slim AS deps
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---- runtime ----
# node:22-slim y no alpine, como pide el §3.3 del contrato: better-sqlite3 es
# nativo y para musl casi nunca hay binario precompilado.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# smbclient: lee las planillas de \\server con las credenciales de Windows
#   del .env (ver server/src/smb.js).
# sqlite3: el CLI, para el backup en caliente que pide el contrato.
RUN apt-get update \
 && apt-get install -y --no-install-recommends smbclient sqlite3 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY --from=build /app/dist ./dist
ENV PUBLIC_DIR=/app/dist
EXPOSE 80
CMD ["node", "server/src/index.js"]
