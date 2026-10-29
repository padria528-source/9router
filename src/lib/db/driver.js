import { ensureDirs, DATA_FILE } from "./paths.js";
import { stripNullBytes } from "./helpers/nullBytes.js";

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
  if (typeof Bun === "undefined") return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return createBunSqliteAdapter();
  } catch {
    return null;
  }
}

async function tryBetterSqlite3() {
  try {
    const { createBetterSqlite3Adapter } = await import("./adapters/betterSqlite3Adapter.js");
    return createBetterSqlite3Adapter();
  } catch {
    return null;
  }
}

async function tryNodeSqlite() {
  // node:sqlite is built into Node.js >= 22.5.0; no npm install or build tools needed
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return createNodeSqliteAdapter();
  } catch {
    return null;
  }
}

async function trySqlJs() {
  // WebAssembly SQLite — works in browser, serverless, and systems without build tools
  try {
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter();
  } catch {
    return null;
  }
}

/**
 * Make every bound string NUL-safe, once, for all drivers.
 */
function withNullByteSafeParams(adapter) {
  const clean = (params) => (Array.isArray(params) ? params.map(stripNullBytes) : params);
  return {
    ...adapter,
    run: (sql, params = []) => adapter.run(sql, clean(params)),
    get: (sql, params = []) => adapter.get(sql, clean(params)),
    all: (sql, params = []) => adapter.all(sql, clean(params)),
  };
}

async function createLocalAdapter() {
  // Order per runtime:
  //   Bun:  bun:sqlite → sql.js
  //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
  let adapter = await tryBunSqlite();
  if (!adapter) adapter = await tryBetterSqlite3();
  if (!adapter) adapter = await tryNodeSqlite();
  if (!adapter) adapter = await trySqlJs();
  if (!adapter) throw new Error("[DB] No SQLite driver available (bun/better/node/sql.js all failed)");
  return withNullByteSafeParams(adapter);
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

  // Migrations stay on the synchronous local SQLite adapter.
  const localAdapter = await createLocalAdapter();

  const { runMigrationOnce } = await import("./migrate.js");
  await runMigrationOnce(localAdapter);

  const adapter = await maybeWrapWithTurso(localAdapter);

  const state = getState();
  if (!state.logged) {
    const suffix = adapter.driver === "turso-mirror"
      ? " | local: " + localAdapter.driver + " | remote persistence: Turso"
      : " | file: " + DATA_FILE;
    console.log("[DB] Driver: " + adapter.driver + suffix);
    state.logged = true;
  }

  return adapter;
}

export async function getDb() {
  const state = getState();
  if (state.instance) return state.instance;

  if (state.initError) {
    const now = Date.now();
    if (state.lastFailedAt && now - state.lastFailedAt < RETRY_COOLDOWN_MS) {
      throw state.initError;
    }
    state.initError = null;
    state.initPromise = null;
  }

  if (!state.initPromise) {
    state.initPromise = initAdapter()
      .then((adapter) => {
        state.instance = adapter;
        state.initError = null;
        return adapter;
      })
      .catch((err) => {
        state.instance = null;
        state.initError = err;
        state.lastFailedAt = Date.now();
        throw err;
      });
  }

  return state.initPromise;
}
