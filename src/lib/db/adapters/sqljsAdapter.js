import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { PRAGMA_SQL } from "../schema.js";

let SQL = null;

async function loadSql() {
  if (SQL) return SQL;
  const options = {};

  try {
    const rootDir = process.cwd().endsWith("tests") ? path.resolve(process.cwd(), "..") : process.cwd();
    const candidatePaths = [
      path.resolve(rootDir, "node_modules/sql.js/dist/sql-wasm.wasm"),
      path.resolve(rootDir, ".open-next/server-functions/default/sql-wasm.wasm"),
      path.resolve(rootDir, "public/sql-wasm.wasm"),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        options.wasmBinary = fs.readFileSync(p);
        break;
      }
    }
  } catch {}

  // In serverless / worker runtime where local wasm is unavailable, fetch wasm binary into Uint8Array
  if (!options.wasmBinary && typeof fetch === "function") {
    try {
      const res = await fetch("https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.14.1/sql-wasm.wasm");
      if (res.ok) {
        const ab = await res.arrayBuffer();
        options.wasmBinary = new Uint8Array(ab);
      }
    } catch {}
  }

  SQL = await initSqlJs(options);
  return SQL;
}

export async function createSqlJsAdapter(filePath) {
  const SQLLib = await loadSql();
  let buf = null;
  try {
    if (filePath && fs.existsSync(filePath)) {
      buf = fs.readFileSync(filePath);
    }
  } catch {
    // In-memory fallback (e.g. Cloudflare Workers)
    buf = null;
  }
  const db = new SQLLib.Database(buf);
  db.exec(PRAGMA_SQL);
  // Schema is created/synced by migrate.js after adapter init

  let dirty = false;
  let saveTimer = null;
  const SAVE_DEBOUNCE_MS = 100;

  function persist() {
    if (!filePath) return;
    try {
      const data = db.export();
      fs.writeFileSync(filePath, Buffer.from(data));
      dirty = false;
    } catch {
      // Ephemeral / serverless runtime: persistence handled by remote database
      dirty = false;
    }
  }

  function scheduleSave() {
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (dirty) {
        try { persist(); } catch (e) { console.error("[sqljs] save failed:", e); }
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function paramsObj(params) {
    if (!params || (Array.isArray(params) && params.length === 0)) return undefined;
    return params;
  }

  function run(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      stmt.step();
      const changes = db.getRowsModified();
      const lastInsertRowid = db.exec("SELECT last_insert_rowid() as id")[0]?.values?.[0]?.[0] ?? null;
      scheduleSave();
      return { changes, lastInsertRowid };
    } finally {
      stmt.free();
    }
  }

  function get(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      if (stmt.step()) return stmt.getAsObject();
      return undefined;
    } finally {
      stmt.free();
    }
  }

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(paramsObj(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function exec(sql) {
    db.exec(sql);
    scheduleSave();
  }

  function transaction(fn) {
    const sp = `sp_${Math.random().toString(36).slice(2)}`;
    db.exec(`SAVEPOINT ${sp}`);
    try {
      const result = fn();
      db.exec(`RELEASE ${sp}`);
      scheduleSave();
      return result;
    } catch (e) {
      try { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); } catch {}
      throw e;
    }
  }

  function close() {
    if (saveTimer) clearTimeout(saveTimer);
    if (dirty) persist();
    db.close();
  }

  // Flush on shutdown
  const flush = () => { if (dirty) try { persist(); } catch {} };
  process.on("beforeExit", flush);
  process.on("SIGINT", flush);
  process.on("SIGTERM", flush);

  return { driver: "sql.js", run, get, all, exec, transaction, close, raw: db };
}
