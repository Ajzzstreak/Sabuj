# Deploying the DealLens API

The server is one Node process with a SQLite file. It ships as a container image built from
`server/Dockerfile`. No host is chosen yet; anything that runs a container with a persistent
volume works.

## Build and run

```bash
docker build -t deallens-server server/
docker run -d --name deallens -p 8787:8787 \
  -v deallens-data:/data \
  -e CORS_ORIGIN=https://app.example.com \
  -e TRUST_PROXY=1 \
  deallens-server
curl http://localhost:8787/v1/health      # {"ok":true}
```

Local production-like run (same image, `NODE_ENV=production`, named volume):

```bash
cp server/.env.example server/.env        # review CORS_ORIGIN and TRUST_PROXY
docker compose up --build
```

The image runs `node dist/index.js` as the non-root `node` user, has a `HEALTHCHECK` on
`GET /v1/health`, and stops cleanly on `SIGTERM`: in-flight requests finish, background timers
stop, pending profile work is flushed, SQLite is closed (forced exit after `SHUTDOWN_TIMEOUT_MS`,
default 10 s). Give the platform a stop grace period of at least that long.

Building behind a TLS-intercepting proxy: `--build-arg HTTPS_PROXY=...` and
`--secret id=npm_ca,src=/path/to/ca.pem` (neither is stored in the image).

## Environment

Every variable is listed with its default in [`server/.env.example`](server/.env.example).
The image sets `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8787`, `DB_PATH=/data/deallens.db`,
`PRICE_PROVIDERS=mock`.

Any invalid value (e.g. `PORT=abc`, `TRUST_PROXY=yes`) stops the server at startup with a
message naming the variable. With `NODE_ENV=production` additionally:

| Variable | In production |
| --- | --- |
| `CORS_ORIGIN` | **Required.** The web app origin(s), comma-separated (`https://app.example.com`), or `*`. The server will not start without it. Native apps do not need CORS. |
| `TRUST_PROXY` | Warned when unset. Number of proxy hops in front of the server: `1` behind one load balancer / reverse proxy (most hosts), `2` behind a CDN plus a load balancer, unset when clients connect directly. Wrong here means per-IP limits see the proxy's IP (everyone shares one limit) or trust a spoofable header. |
| `DB_PATH` | Must be a file (not `:memory:`), on the mounted volume. |
| `PRICE_PROVIDERS` | Warned while it includes `mock` (synthetic demo prices). |

Optional: `ANTHROPIC_API_KEY` (enables the Claude profiler and Claude interpretation in
`POST /v1/ask`; without it both use deterministic fallbacks), `CLAUDE_MAX_CALLS_PER_HOUR`
(cost ceiling), provider credentials (`KROGER_*`, `WALMART_*`, `BESTBUY_API_KEY`),
`PUSH_PROVIDER` / `EXPO_ACCESS_TOKEN`, rate limits. Pass secrets through the host's secret
store, never baked into the image.

## Data: SQLite on a volume

- The database is `/data/deallens.db` plus `-wal` and `-shm` files (WAL mode). Mount a
  persistent volume at `/data`; without one, every device token, alert and profile is lost on
  redeploy.
- Back up with SQLite's online backup, not by copying the file while the server runs (a plain
  copy without the `-wal` file can be inconsistent). For example, from inside the container:
  `node -e "require('better-sqlite3')('/data/deallens.db').backup('/data/backup.db').then(() => console.log('ok'))"`,
  then copy `backup.db` off the volume. Or stop the container and copy the whole `/data`.
- Data is per device and erased by `DELETE /v1/profile` or the retention purge
  (`DEVICE_RETENTION_DAYS`); backups keep erased data until they expire, so set a backup
  retention you can state in the privacy policy.

## Single instance only

Run exactly **one** instance. The catalog cache, every rate limiter (including the per-IP
device-registration caps), the `/v1/ask` cache, the Claude budget and the alert/purge timers
live in process memory, and SQLite is a local file. Two replicas would double the limits and
the Claude budget, run alert checks twice and each have their own database. Scaling out needs
a shared database and shared rate limiting first. Restarts reset the in-memory limits and caches.

## Checklist before going public

- [ ] `CORS_ORIGIN` set to the real web app origin (or a deliberate `*`).
- [ ] `TRUST_PROXY` matches the number of proxies in front of the server (usually `1`); check that
      `remoteAddress` in the request logs is a client IP, not the load balancer's.
- [ ] A persistent volume at `/data`, and a tested backup + restore.
- [ ] HTTPS terminated by the host / proxy (the app's production builds require an `https` API URL).
- [ ] `ANTHROPIC_API_KEY` set or deliberately left unset; `CLAUDE_MAX_CALLS_PER_HOUR` sized for the budget.
- [ ] Prices: `PRICE_PROVIDERS=mock` serves **synthetic demo prices** (the app shows a "Demo prices"
      notice). The Kroger / Walmart / Best Buy adapters are **unverified against the live APIs**;
      see the checklist in `server/README.md` and each provider's terms for price display,
      caching and links before enabling one.
- [ ] Tax figures are estimates (`server/src/tax.ts`); review before relying on them.
- [ ] Legal text: `app/src/content/legal.ts` is `[DRAFT]` placeholder copy; replace and review it,
      then set `LEGAL_COPY_IS_FINAL = true`. Set `AFFILIATE_LINKS_ENABLED` only if links carry tags.
- [ ] `PUSH_PROVIDER=expo` with the app's EAS project configured, or `none`.
- [ ] Health check wired to `GET /v1/health`; logs (JSON on stdout) collected somewhere.
- [ ] CI green (`.github/workflows/ci.yml`: contract sync, server, app, image build).
