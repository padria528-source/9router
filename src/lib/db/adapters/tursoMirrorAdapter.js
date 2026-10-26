import { createClient } from "@libsql/client/http";
import { TABLES, buildCreateTableSql } from "../schema.js";

const MIRROR_READY_KEY = "tursoMirrorReady";
const BATCH_SIZE = 100;

function rows(result) {
  const cols = result.columns || [];
  return (result.rows || []).map((row) => {
    const out = {};
    cols.forEach((c, i) => { out[c] = Array.isArray(row) ? row[i] : row[c]; });
    return out;
  });
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isWrite(sql) {
  return /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(String(sql || "").trim());
}

function makeInsert(table, columns, row) {
  return {
    sql: `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    args: columns.map((c) => row[c] ?? null),
  };
}

async function ensureSchema(client) {
  for (const [name, def] of Object.entries(TABLES)) {
    await client.execute(buildCreateTableSql(name, def));
    for (const idx of def.indexes || []) await client.execute(idx);
  }
}

function localCount(local) {
  let total = 0;
  for (const name of Object.keys(TABLES)) {
    if (name === "_meta") continue;
    try { total += Number(local.get(`SELECT COUNT(*) AS c FROM ${name}`)?.c || 0); } catch {}
  }
  return total;
}

async function remoteCount(client) {
  let total = 0;
  for (const name of Object.keys(TABLES)) {
    if (name === "_meta") continue;
    const r = rows(await client.execute(`SELECT COUNT(*) AS c FROM ${name}`))[0];
    total += Number(r?.c || 0);
  }
  return total;
}

async function marker(client) {
  const r = rows(await client.execute({
    sql: "SELECT value FROM _meta WHERE key = ?",
    args: [MIRROR_READY_KEY],
  }))[0];
  return r?.value || null;
}

async function setMarker(client) {
  await client.execute({
    sql: "INSERT INTO _meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [MIRROR_READY_KEY, new Date().toISOString()],
  });
}

async function seedRemote(local, client) {
  for (const name of Object.keys(TABLES).filter((n) => n !== "_meta")) {
    await client.execute(`DELETE FROM ${name}`);
  }
  await client.execute("DELETE FROM _meta");

  for (const [name, def] of Object.entries(TABLES)) {
    const columns = Object.keys(def.columns);
    const data = local.all(`SELECT ${columns.join(", ")} FROM ${name}`);
    for (const group of chunks(data, BATCH_SIZE)) {
      await client.batch(group.map((row) => makeInsert(name, columns, row)), "write");
    }
  }
  await setMarker(client);
}

async function restoreLocal(local, client) {
  for (const [name, def] of Object.entries(TABLES)) {
    const columns = Object.keys(def.columns);
    const data = rows(await client.execute(`SELECT ${columns.join(", ")} FROM ${name}`));
    local.transaction(() => {
      local.run(`DELETE FROM ${name}`);
      for (const row of data) {
        const stmt = makeInsert(name, columns, row);
        local.run(stmt.sql, stmt.args);
      }
    });
  }
}

export async function createTursoMirrorAdapter(local, { url, authToken }) {
  const client = createClient({ url, authToken });
  await ensureSchema(client);

  const lc = localCount(local);
  const rc = await remoteCount(client);
  const ready = await marker(client);

  if (!ready && lc > 0) {
    console.log("[DB][Turso] seeding remote from local SQLite...");
    await seedRemote(local, client);
    console.log("[DB][Turso] initial seed complete");
  } else if (lc === 0 && rc > 0) {
    console.log("[DB][Turso] restoring local SQLite from Turso...");
    await restoreLocal(local, client);
    console.log("[DB][Turso] restore complete");
  } else if (!ready) {
    await setMarker(client);
  }

  let queue = Promise.resolve();
  let depth = 0;
  let captured = [];
  let lastError = null;

  function enqueue(statements) {
    const work = statements.filter((s) => isWrite(s.sql));
    if (!work.length) return;
    queue = queue.then(async () => {
      try {
        if (work.length === 1) await client.execute(work[0]);
        else await client.batch(work, "write");
        lastError = null;
      } catch (e) {
        lastError = e;
        console.error("[DB][Turso] mirror write failed:", e?.message || e);
      }
    });
  }

  function mirror(stmt) {
    if (!isWrite(stmt.sql)) return;
    if (depth > 0) captured.push(stmt);
    else enqueue([stmt]);
  }

  return {
    driver: "turso-mirror",
    run(sql, params = []) {
      const r = local.run(sql, params);
      mirror({ sql, args: params });
      return r;
    },
    get(sql, params = []) { return local.get(sql, params); },
    all(sql, params = []) { return local.all(sql, params); },
    exec(sql) {
      const r = local.exec(sql);
      for (const part of String(sql).split(";").map((s) => s.trim()).filter(Boolean)) {
        mirror({ sql: part, args: [] });
      }
      return r;
    },
    transaction(fn) {
      const outer = depth === 0;
      if (outer) captured = [];
      depth++;
      try {
        const r = local.transaction(fn);
        depth--;
        if (outer && captured.length) {
          const batch = captured;
          captured = [];
          enqueue(batch);
        }
        return r;
      } catch (e) {
        depth--;
        if (outer) captured = [];
        throw e;
      }
    },
    checkpoint() { return local.checkpoint?.(); },
    async flush() {
      await queue;
      if (lastError) throw lastError;
    },
    close() {
      try { local.close?.(); } catch {}
      queue.finally(() => { try { client.close(); } catch {} });
    },
    raw: local.raw,
    remote: client,
  };
}
