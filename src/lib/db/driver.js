import { ensureDirs, DATA_FILE } from "./paths.js";

const RETRY_COOLDOWN_MS = 2000;

// Use global to survive Next.js dev hot-reload (module state resets on reload)
function getState() {
  if (!global._dbAdapter) {
    global._dbAdapter = {
      instance: null,
      initPromise: null,
      initError: null,
      lastFailedAt: null,
      logged: false,
    };
  }
  return global._dbAdapter;
}

async function tryBunSqlite() {
  // Bun runtime only — built-in, no install needed
  if (!process.versions.bun) return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return await createBunSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] bun:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function tryBetterSqlite() {
  // Skip on Bun — better-sqlite3 native bindings unsupported
  if (process.versions.bun) return null;
  // Skip on Node >= 24: the native addon SIGSEGVs on load there, which is a
  // process-level crash the try/catch below cannot recover from. node:sqlite covers it.
  const [nodeMajor] = process.versions.node.split(".").map(Number);
  if (nodeMajor >= 24) return null;
  try {
    const { createBetterSqliteAdapter } = await import("./adapters/betterSqliteAdapter.js");
    return createBetterSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] better-sqlite3 unavailable: ${e.message}`);
    return null;
  }
}

async function tryNodeSqlite() {
  // Built-in since Node 22.5.0 — no install needed. Skip under Bun (no node:sqlite).
  if (process.versions.bun) return null;
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return await createNodeSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] node:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function trySqlJs() {
  try {
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] sql.js unavailable: ${e.message}`);
    return null;
  }
}

async function createLocalAdapter() {
  // Order per runtime:
  //   Bun:  bun:sqlite → sql.js
  //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
  let adapter = await tryBunSqlite();
  if (!adapter) adapter = await tryBetterSqlite();
  if (!adapter) adapter = await tryNodeSqlite();
  if (!adapter) adapter = await trySqlJs();
  if (!adapter) throw new Error("[DB] No SQLite driver available (bun/better/node/sql.js all failed)");
  return adapter;
}

async function maybeWrapWithTurso(localAdapter) {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (!url) return localAdapter;

  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!authToken) {
    throw new Error("[DB] TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing");
  }

  const { createTursoMirrorAdapter } = await import("./adapters/tursoMirrorAdapter.js");
  return await createTursoMirrorAdapter(localAdapter, { url, authToken });
}

async function initAdapter() {
  ensureDirs();

  // Migrations stay on the synchronous local SQLite adapter. This preserves the
  // existing DB contract used throughout 9Router. Turso is layered on after the
  // local schema is ready, so no application callsite needs an async DB rewrite.
  const localAdapter = await createLocalAdapter();

  const { runMigrationOnce } = await import("./migrate.js");
  await runMigrationOnce(localAdapter);

  const adapter = await maybeWrapWithTurso(localAdapter);

  const state = getState();
  if (!state.logged) {
    const suffix = adapter.driver === "turso-mirror"
      ? ` | local: ${localAdapter.driver} | remote persistence: Turso`
      : ` | file: ${DATA_FILE}`;
    console.log(`[DB] Driver: ${adapter.driver}${suffix}`);
    state.logged = true;
  }

  return adapter;
}

export async function getAdapter() {
  const state = getState();
  if (state.instance) return state.instance;
  if (state.initPromise) return state.initPromise;

  // Enforce cooldown backoff so failures do not spin in tight retry loops
  const now = Date.now();
  if (state.initError && state.lastFailedAt && (now - state.lastFailedAt) < RETRY_COOLDOWN_MS) {
    throw state.initError;
  }

  state.initPromise = initAdapter()
    .then((a) => {
      state.instance = a;
      state.initError = null;
      state.lastFailedAt = null;
      return a;
    })
    .catch((err) => {
      state.initError = err;
      state.lastFailedAt = Date.now();
      state.initPromise = null;
      throw err;
    });

  return state.initPromise;
}

export function getDatabaseStatus() {
  const state = getState();
  if (state.instance) {
    try {
      state.instance.get("SELECT 1 AS ok");
      return { ready: true, status: "ready" };
    } catch {
      return { ready: false, status: "error" };
    }
  }
  if (state.initPromise) {
    return { ready: false, status: "initializing" };
  }
  if (state.initError) {
    return { ready: false, status: "failed" };
  }
  return { ready: false, status: "uninitialized" };
}

export function getAdapterSync() {
  const state = getState();
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}
