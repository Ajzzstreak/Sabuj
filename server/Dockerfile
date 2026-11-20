# syntax=docker/dockerfile:1.7
# DealLens API server. Build context: this directory (server/).
#   docker build -t deallens-server .
#   docker run -p 8787:8787 -v deallens-data:/data -e CORS_ORIGIN=https://app.example.com deallens-server
# See ../DEPLOY.md.

# Node 22, pinned to an exact version, on Debian bookworm (glibc) in both stages.
# better-sqlite3 is a native addon: on install npm runs node-gyp for it (it uses the bundled
# N-API prebuild when one matches, else compiles SQLite). node-gyp needs python3, make and g++,
# so the build stage uses the full `bookworm` image, which has them; the runtime stage is the
# `bookworm-slim` image of the SAME Node version and Debian release, so the addon's ABI and
# glibc match. npm_config_nodedir points node-gyp at the image's own headers (no download).
# The smoke test at the end of the build stage fails the build if the module cannot load.
ARG NODE_VERSION=22.23.4
ARG BUILD_IMAGE=node:${NODE_VERSION}-bookworm
ARG RUNTIME_IMAGE=node:${NODE_VERSION}-bookworm-slim

# ---- build: all deps, compile TypeScript, then drop dev deps -------------------------------
FROM ${BUILD_IMAGE} AS build
WORKDIR /app
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false npm_config_nodedir=/usr/local
COPY package.json package-lock.json ./
# Optional: behind a TLS-intercepting proxy, pass its CA as a build secret
#   docker build --secret id=npm_ca,src=/path/to/ca.pem ...
# (HTTPS_PROXY is a predefined build arg: --build-arg HTTPS_PROXY=...). Neither ends up in the image.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev \
 && node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); db.prepare('select 1').get(); db.close(); console.log('better-sqlite3 OK')"

# ---- runtime: production deps + compiled JS only, non-root ---------------------------------
FROM ${RUNTIME_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DB_PATH=/data/deallens.db \
    LOG_LEVEL=info \
    PRICE_PROVIDERS=mock
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The `node` user (uid 1000) ships with the official image. /data holds the SQLite file
# (plus its -wal/-shm); mount a volume there or the data dies with the container.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Node runs as PID 1 and handles SIGTERM itself (graceful shutdown in src/index.ts).
# CORS_ORIGIN has no default on purpose: NODE_ENV=production refuses to start without it.
CMD ["node", "dist/index.js"]
