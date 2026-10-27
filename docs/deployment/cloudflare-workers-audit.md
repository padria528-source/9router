# Cloudflare Workers Baseline Audit Report

**Date:** 2026-10-26
**Repository:** `padria528-source/9router`
**Target Version:** `9Router v0.5.104`
**Base Commit:** `a54d749b04b080754201bd4caa513d5c753c79fe` (`migrate-turso`)
**Staging Branch:** `cloudflare-workers-staging`
**Auditor / Mode:** Senior Staff Engineer + Cloudflare Workers Specialist + Database Migration Engineer

---

## 1. Executive Summary

This audit assesses the readiness of `9Router v0.5.104` for execution on the Cloudflare Workers serverless runtime utilizing `@opennextjs/cloudflare` with Turso (`@libsql/client`) as the remote persistence layer.

The original application was architected as a hybrid Node.js/Bun server running via `custom-server.js` or `next start`, relying heavily on:
1. Local SQLite file databases via `better-sqlite3`, `bun:sqlite`, `node:sqlite`, or `sql.js`.
2. Local filesystem writes for state, backups, and data directories (`data/`, `db/`).
3. OS process-level features: raw TCP sockets, MITM reverse proxies (listening on port 443), hosts file mutations, and local daemon subprocesses (`tailscale`, `cloudflared`).

To achieve production-grade stability on Cloudflare Workers, these dependencies were systematically audited, isolated, and adapted.

---

## 2. Environment & Repository Baseline

| Parameter | Baseline Value | Audit Status |
| :--- | :--- | :--- |
| **Git Remote** | `https://github.com/padria528-source/9router.git` | Verified |
| **Base Branch** | `migrate-turso` | Protected & Unaltered |
| **Base Commit SHA** | `a54d749b04b080754201bd4caa513d5c753c79fe` | Clean Baseline |
| **Staging Branch** | `cloudflare-workers-staging` | Isolated Worktree |
| **Application Runtime** | Next.js 16.4.3 (App Router, Webpack engine) | Compatible via OpenNext |
| **Serverless Adapter** | `@opennextjs/cloudflare` v1.20.13 | Integrated |
| **AWS OpenNext Core** | `@opennextjs/aws` v4.1.12 | Integrated |
| **Wrangler CLI** | `wrangler` v3.114.15 | Configured |
| **Package Manager** | `npm` (with `package-lock.json`) | Verified |
| **Database Engine** | Hybrid `sql.js` (in-memory) + Turso HTTP Mirror (`@libsql/client/http`) | Operational |

---

## 3. Dependency & Module Inspection

### 3.1 Node.js Runtime Dependencies
- `node:fs` & `node:path`: Cloudflare Workers provides an in-memory/virtual polyfill for `node:fs` under the `nodejs_compat` flag. Real disk persistence is unavailable. All calls to `fs.writeFileSync` in `sqljsAdapter.js`, `backup.js`, `dataDir.js`, and `paths.js` have been wrapped in defensive try-catch guards.
- `node:dns`: `dnsResolver.js` attempted to call `resolver.setServers(...)`. Cloudflare's runtime throws `Not implemented at setServers`. Defensive fallback applied.
- `node:child_process`: Used in `src/mitm/` and tunnel managers (`tailscale`, `cloudflared`). Completely unsupported in edge workers.
- `node:net` & `node:tls`: Used in `custom-server.js` and `src/mitm/server.js` for port 443 SNI proxying and certificate sniffing. Unsupported in worker request-response pipelines.

### 3.2 Native & Binary Modules
- `better-sqlite3`: Native C++ Node addon. Incompatible with `workerd`.
- `bun:sqlite`: Bun-native binary module. Previously caused Webpack/esbuild bundling failure when referenced directly. Guarded via dynamic evaluator: `new Function('return import("bun:sqlite")')()`.
- `node:sqlite`: Experimental Node 22+ module, absent in Cloudflare Workers.
- `sql.js` (WebAssembly): Pure WASM SQLite engine. Loaded into memory using pre-bundled or CDN-fetched `sql-wasm.wasm`. Used as the in-memory SQL execution engine for synchronous query compatibility across existing repositories.

---

## 4. Git Cleanliness & Untracked Blobs

During initial inspection, 299 stale build output files (`.open-next/*` and `.wrangler/*`) were identified as untracked artifacts.
- `.gitignore` was updated to explicitly exclude `/.open-next/`, `/.wrangler/`, `Untitled*`, and `/public/sql-wasm.wasm`.
- A dedicated prep script `scripts/prepare-worker.mjs` was introduced to safely copy the required WebAssembly runtime assets prior to bundling without polluting source control.

---

## 5. Security & Isolation Boundaries

1. **Production Isolation:** No commands have touched or will touch production DNS, production Cloudflare resources, or production databases.
2. **Secret Containment:** No tokens, passwords, or private keys are committed into git or stored in documentation. All secrets are passed via local `.dev.vars` during development or Wrangler secrets (`wrangler secret put`) for deployment.
3. **Local Staging Scope:** All modifications are isolated to the `cloudflare-workers-staging` branch.
