# Cloudflare Workers Feature Compatibility Matrix

**Repository:** `padria528-source/9router`
**Application Target:** `9Router v0.5.104`
**Runtime:** Cloudflare Workers (`workerd`) via `@opennextjs/cloudflare`

---

## 1. Compatibility Classification Legend

- **PASS:** Fully compatible with Cloudflare Workers without architecture modification.
- **ADAPT:** Compatible after refactoring or runtime adaptation (e.g. polyfill, safe fallback, defensive error suppression).
- **BLOCKED:** Incompatible with serverless Workers runtime; requires a standalone Node.js daemon, sidecar, or separate service.
- **UNKNOWN:** Insufficient runtime verification data.

---

## 2. Comprehensive Feature Matrix

| Feature / Subsystem | Current Implementation | Status | Evidence / Technical Constraint | Required Change | Test Method | Result & Residual Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Next.js App Router (SSR & Static)** | Next.js 16.4.3 App Router | **PASS** | Built via `@opennextjs/cloudflare`. Static assets served via Cloudflare `ASSETS` binding. SSR pages render HTML. | `open-next.config.ts`, `wrangler.jsonc` assets binding. | `GET /login`, `GET /favicon.svg`, `GET /manifest.webmanifest` | **PASS**. Cold start latency on edge SSR: ~100-300ms. |
| **REST API Routes** | Next.js route handlers (`app/api/*`) | **PASS** | Standard Web `Request`/`Response` pipeline runs natively in `workerd`. | None required. | `GET /api/version` (HTTP 200), `GET /api/health?probe=liveness` | **PASS**. Low risk. |
| **JWT & Session Auth** | `jose` / standard crypto cookies | **PASS** | Web Cryptography API (`crypto.subtle`) is natively supported on Workers. | Ensure `JWT_SECRET` is set in environment secrets. | `GET /dashboard` -> HTTP 307 redirect to `/login`. | **PASS**. Works identically to Node.js. |
| **Streaming / SSE** | `ReadableStream` responses | **PASS** | Native Fetch API streams supported without buffering. | Handled by OpenNext streaming runtime. | Stream completions via `/api/v1/chat/completions`. | **PASS**. Must respect Worker 100-second Wall-clock / CPU limit on Free tier. |
| **Database Repositories** | Synchronous queries (`db.prepare().get() / .all()`) | **ADAPT** | Existing repos expect synchronous SQLite calls; Workers cannot mount persistent disk SQLite (`better-sqlite3`). | Hybrid driver: in-memory `sql.js` (WASM) as sync query engine + `tursoMirrorAdapter` for async HTTP write sync. | `unit/db-driver-chain.test.js`, `/api/health`. | **ADAPT (Verified)**. DB cold-start must initialize in-memory schema from Turso. |
| **Turso libSQL Sync** | `@libsql/client/http` | **PASS** | Pure HTTP/REST driver compatible with `fetch()` in serverless environments. | Include `@libsql/isomorphic-fetch` and `@libsql/isomorphic-ws` in Next.js tracing. | Build verification + DB health check. | **PASS**. Requires reliable outbound HTTPS to Turso cloud. |
| **DNS Resolution (`dnsResolver.js`)** | `node:dns` `Resolver` | **ADAPT** | Workers throws `Uncaught Error: Not implemented at setServers`. | Wrapped `resolver.setServers(...)` in `try { ... } catch {}`. | Module load verification in `wrangler dev`. | **ADAPT (Verified)**. Fallback to default Cloudflare DNS resolution. |
| **Local File Backups (`backup.js`)** | `fs.mkdirSync`, `fs.writeFileSync` | **ADAPT** | Workers filesystem is ephemeral / read-only. File writes throw. | Guarded filesystem calls with defensive try-catch. Backup responsibilities transferred to Turso snapshots. | Unit testing + code path inspection. | **ADAPT (Verified)**. Local disk backups disabled on Workers. |
| **MITM Interception Proxy (`src/mitm/`)** | Raw TCP port 443 listener, TLS SNI sniffing, OS `/etc/hosts` modification | **BLOCKED** | Cloudflare Workers only processes HTTP/HTTPS ingress on standard edge routing. Cannot bind raw low ports (443) or intercept host networking. | None feasible in Worker. Feature must be hosted on local host or VM if MITM functionality is needed. | Architecture audit of `src/mitm/server.js`. | **BLOCKED**. Documented as unsupported on edge Worker. |
| **Custom HTTP Server (`custom-server.js`)** | Node.js `http`/`http2` server, raw socket inspection, h2c downgrade | **BLOCKED** | Bypassed completely in Cloudflare Workers. Cloudflare Edge terminates TLS and routes HTTP to Worker. | Workers natively provides `cf-connecting-ip` and TLS handshake handling. | Edge request inspection. | **BLOCKED on Worker (Redundant)**. Cloudflare edge handles all ingress. |
| **Background Daemons & Schedulers** | Long-running `setInterval` timers in Node process | **ADAPT** | Workers instances are suspended between requests. Process-level `setInterval` does not persist. | Cloudflare Cron Triggers (`[triggers] crons = [...]`) or external webhooks. | Wrangler config audit. | **ADAPT**. Periodic token refresh can use Cloudflare Cron Triggers. |
| **Tailscale / Cloudflared Tunnels (`src/lib/tunnel/`)** | Spawns external CLI processes (`tailscale`, `cloudflared`) | **BLOCKED** | Cloudflare Workers has no OS process model (`child_process.spawn` is unavailable). | Tunnels must run on client machines or dedicated servers. | Code inspection of `tailscale.js`. | **BLOCKED on Worker**. Edge Worker is already globally public. |

---

## 3. Summary of Adaptations Implemented

1. **`sqljsAdapter.js`:**
   - WebAssembly binary autodiscovery supports both local repository execution (via `prepare-worker.mjs` / `public/sql-wasm.wasm`) and CDN fallback (`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.14.1/sql-wasm.wasm`).
   - Disk read and write operations wrapped in non-fatal handlers, allowing `sql.js` to serve as a high-performance in-memory cache synchronized with Turso.
2. **`bunSqliteAdapter.js`:**
   - Replaced static `import("bun:sqlite")` with dynamic evaluation `new Function('return import("bun:sqlite")')()` to prevent bundler errors when targeting non-Bun environments.
3. **`dnsResolver.js`:**
   - Guarded unsupported `dns.setServers()` calls.
4. **`next.config.mjs`:**
   - Included `@libsql/isomorphic-fetch` and `@libsql/isomorphic-ws` in `outputFileTracingIncludes` to ensure proper trace resolution by OpenNext.
5. **`wrangler.jsonc`:**
   - Standardized on modern JSONC configuration targeting `.open-next/worker.js` with `compatibility_date: "2026-03-01"` and `nodejs_compat`.
