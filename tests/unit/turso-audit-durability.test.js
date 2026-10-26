import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// In-memory remote LibSQL mock simulating Turso cloud
class MockTursoStore {
  constructor() {
    this.tables = {};
    this.failNextWrites = 0;
    this.failStartup = false;
    this.executedStatements = [];
  }

  reset() {
    this.tables = {};
    this.failNextWrites = 0;
    this.failStartup = false;
    this.executedStatements = [];
  }

  ensureTable(name) {
    if (!this.tables[name]) this.tables[name] = [];
  }

  execute(stmt) {
    const sql = typeof stmt === "string" ? stmt : stmt.sql;
    const args = typeof stmt === "string" ? [] : (stmt.args || []);
    this.executedStatements.push({ sql, args });

    if (this.failStartup && /CREATE TABLE/i.test(sql)) {
      throw new Error("Network timeout: Turso cloud unreachable on startup");
    }

    if (this.failNextWrites > 0 && /^(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql.trim())) {
      this.failNextWrites--;
      throw new Error("Turso write rejected: 503 Service Unavailable");
    }

    // CREATE TABLE IF NOT EXISTS
    const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS ([a-zA-Z0-9_]+)/i);
    if (createMatch) {
      this.ensureTable(createMatch[1]);
      return { columns: [], rows: [] };
    }

    // CREATE INDEX
    if (/CREATE INDEX/i.test(sql)) {
      return { columns: [], rows: [] };
    }

    // SELECT value FROM _meta WHERE key = ?
    if (/SELECT value FROM _meta WHERE key =/i.test(sql)) {
      this.ensureTable("_meta");
      const key = args[0];
      const found = this.tables._meta.find((r) => r.key === key);
      return { columns: ["value"], rows: found ? [[found.value]] : [] };
    }

    // INSERT INTO _meta
    if (/INSERT INTO _meta/i.test(sql)) {
      this.ensureTable("_meta");
      const [key, value] = args;
      const idx = this.tables._meta.findIndex((r) => r.key === key);
      if (idx >= 0) this.tables._meta[idx] = { key, value };
      else this.tables._meta.push({ key, value });
      return { columns: [], rows: [] };
    }

    // DELETE FROM table
    const delMatch = sql.match(/DELETE FROM ([a-zA-Z0-9_]+)/i);
    if (delMatch) {
      const t = delMatch[1];
      this.tables[t] = [];
      return { columns: [], rows: [] };
    }

    // SELECT COUNT(*) AS c FROM table
    const countMatch = sql.match(/SELECT COUNT\(\*\) AS c FROM ([a-zA-Z0-9_]+)/i);
    if (countMatch) {
      const t = countMatch[1];
      const cnt = (this.tables[t] || []).length;
      return { columns: ["c"], rows: [[cnt]] };
    }

    // SELECT cols FROM table
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)/i);
    if (selectMatch) {
      const t = selectMatch[2];
      const rows = this.tables[t] || [];
      const cols = selectMatch[1].split(",").map((s) => s.trim());
      const resRows = rows.map((r) => cols.map((c) => r[c] ?? null));
      return { columns: cols, rows: resRows };
    }

    // INSERT [OR REPLACE] INTO table (cols) VALUES (...)
    const insertMatch = sql.match(/INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+([a-zA-Z0-9_]+)\s*\((.+?)\)/i);
    if (insertMatch) {
      const t = insertMatch[1];
      this.ensureTable(t);
      const cols = insertMatch[2].split(",").map((s) => s.trim());
      const row = {};
      cols.forEach((c, i) => { row[c] = args[i]; });

      // Upsert by primary key (id, dateKey, or scope+key)
      let matchIdx = -1;
      if (row.id !== undefined) {
        matchIdx = this.tables[t].findIndex((r) => r.id === row.id);
      } else if (row.dateKey !== undefined) {
        matchIdx = this.tables[t].findIndex((r) => r.dateKey === row.dateKey);
      } else if (row.scope !== undefined && row.key !== undefined) {
        matchIdx = this.tables[t].findIndex((r) => r.scope === row.scope && r.key === row.key);
      } else if (row.key !== undefined) {
        matchIdx = this.tables[t].findIndex((r) => r.key === row.key);
      }

      if (matchIdx >= 0) this.tables[t][matchIdx] = row;
      else this.tables[t].push(row);
      return { columns: [], rows: [] };
    }

    return { columns: [], rows: [] };
  }

  batch(stmts, mode) {
    if (this.failNextWrites > 0) {
      this.failNextWrites--;
      throw new Error("Turso batch write failed: Connection reset");
    }
    const results = [];
    for (const stmt of stmts) {
      results.push(this.execute(stmt));
    }
    return results;
  }
}

const mockStore = new MockTursoStore();

vi.mock("@libsql/client/http", () => ({
  createClient: vi.fn(() => ({
    execute: vi.fn(async (stmt) => mockStore.execute(stmt)),
    batch: vi.fn(async (stmts, mode) => mockStore.batch(stmts, mode)),
    close: vi.fn(),
  })),
}));

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-audit-"));
  process.env.DATA_DIR = tempDir;
  mockStore.reset();
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  vi.clearAllMocks();
});

describe("Phase B — Turso Synchronization and Durability Deep Audit", () => {
  it("B1: verifies atomic and idempotent initial seed from local SQLite to Turso", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");

    // Populate local with mock provider connection and API key
    local.run(
      "INSERT INTO providerConnections(id, provider, authType, name, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["pc-1", "openai", "apikey", "Test OpenAI", "{}", "2026-10-26T00:00:00Z", "2026-10-26T00:00:00Z"]
    );
    local.run(
      "INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      ["k-1", "sk-secret123", "Prod Key", "mach-1", 1, "2026-10-26T00:00:00Z"]
    );

    expect(local.get("SELECT COUNT(*) as c FROM providerConnections").c).toBe(1);
    expect(local.get("SELECT COUNT(*) as c FROM apiKeys").c).toBe(1);

    // Initial seed to remote
    const adapter = await createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" });
    await adapter.flush();

    // Verify remote received the records
    expect(mockStore.tables.providerConnections?.length).toBe(1);
    expect(mockStore.tables.providerConnections[0].id).toBe("pc-1");
    expect(mockStore.tables.apiKeys?.length).toBe(1);
    expect(mockStore.tables.apiKeys[0].id).toBe("k-1");

    // Verify tursoMirrorReady marker is set
    const readyMarker = mockStore.tables._meta?.find((r) => r.key === "tursoMirrorReady");
    expect(readyMarker).toBeDefined();

    adapter.close();
  });

  it("B2: verifies repeated initialization is idempotent across server restarts", async () => {
    process.env.TURSO_DATABASE_URL = "http://turso.mock";
    process.env.TURSO_AUTH_TOKEN = "mock-token";

    // Boot 1: initialize and insert record
    const { getAdapter: getAdapter1 } = await import("@/lib/db/driver.js");
    const adapter1 = await getAdapter1();

    adapter1.run(
      "INSERT INTO providerConnections(id, provider, authType, name, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["pc-idempotent", "anthropic", "apikey", "Anthropic Prod", "{}", "2026-10-26T00:00:00Z", "2026-10-26T00:00:00Z"]
    );
    await adapter1.flush();

    expect(adapter1.get("SELECT COUNT(*) as c FROM providerConnections").c).toBe(1);
    expect(mockStore.tables.providerConnections?.length).toBe(1);

    // Simulate clean server restart
    adapter1.close();
    delete global._dbAdapter;
    vi.resetModules();

    // Boot 2: re-initialize with same disk DB and same Turso DB
    const { getAdapter: getAdapter2 } = await import("@/lib/db/driver.js");
    const adapter2 = await getAdapter2();

    expect(adapter2.get("SELECT COUNT(*) as c FROM providerConnections").c).toBe(1);
    expect(mockStore.tables.providerConnections?.length).toBe(1);
    expect(adapter2.get("SELECT name FROM providerConnections WHERE id = 'pc-idempotent'").name).toBe("Anthropic Prod");

    adapter2.close();
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
  });

  it("B3: verifies cold-start recovery restores empty local SQLite from Turso cloud", async () => {
    // Stage remote database with cloud data (as if populated in a previous session)
    mockStore.ensureTable("_meta");
    mockStore.tables._meta.push({ key: "tursoMirrorReady", value: "2026-10-26T01:00:00Z" });
    mockStore.ensureTable("providerConnections");
    mockStore.tables.providerConnections.push({
      id: "pc-restored",
      provider: "google",
      authType: "apikey",
      name: "Gemini Pro",
      email: null,
      priority: 1,
      isActive: 1,
      data: JSON.stringify({ note: "restored from turso" }),
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    });
    mockStore.ensureTable("combos");
    mockStore.tables.combos.push({
      id: "combo-1",
      name: "Default-Combo",
      kind: "fallback",
      models: JSON.stringify(["gemini-1.5-pro", "claude-3-5-sonnet"]),
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    });

    // Local DB is fresh and empty
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();

    expect(local.get("SELECT COUNT(*) as c FROM providerConnections").c).toBe(0);
    expect(local.get("SELECT COUNT(*) as c FROM combos").c).toBe(0);

    // Initializing adapter triggers restoreLocal because lc === 0 && rc > 0
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");
    const adapter = await createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" });

    // Assert local SQLite now contains restored data
    const restoredPC = local.get("SELECT * FROM providerConnections WHERE id = ?", ["pc-restored"]);
    expect(restoredPC).toBeDefined();
    expect(restoredPC.name).toBe("Gemini Pro");

    const restoredCombo = local.get("SELECT * FROM combos WHERE id = ?", ["combo-1"]);
    expect(restoredCombo).toBeDefined();
    expect(restoredCombo.name).toBe("Default-Combo");

    adapter.close();
  });

  it("B4: verifies partial remote write failure does not crash local execution and is exposed via flush()", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");

    const adapter = await createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" });

    // Configure next remote write to fail
    mockStore.failNextWrites = 1;

    // Local write should succeed synchronously
    expect(() => {
      adapter.run(
        "INSERT INTO providerConnections(id, provider, authType, name, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["pc-fail-test", "xai", "apikey", "Grok", "{}", "2026-10-26T00:00:00Z", "2026-10-26T00:00:00Z"]
      );
    }).not.toThrow();

    // Local DB has the record immediately
    const localRow = local.get("SELECT * FROM providerConnections WHERE id = ?", ["pc-fail-test"]);
    expect(localRow).toBeDefined();

    // flush() must reject with the recorded remote error
    await expect(adapter.flush()).rejects.toThrow(/Turso write rejected: 503/);

    adapter.close();
  });

  it("B5: verifies fail-fast startup behavior when remote database is unreachable", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");

    mockStore.failStartup = true;

    // createTursoMirrorAdapter must throw so ephemeral host does not serve empty state
    await expect(
      createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" })
    ).rejects.toThrow(/Turso cloud unreachable on startup/);
  });

  it("B6: verifies write ordering and atomic transaction batching", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");

    const adapter = await createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" });

    // Run a transaction with 3 operations
    adapter.transaction(() => {
      adapter.run("INSERT INTO kv(scope, key, value) VALUES (?, ?, ?)", ["test", "k1", "v1"]);
      adapter.run("INSERT INTO kv(scope, key, value) VALUES (?, ?, ?)", ["test", "k2", "v2"]);
      adapter.run("INSERT INTO kv(scope, key, value) VALUES (?, ?, ?)", ["test", "k3", "v3"]);
    });

    await adapter.flush();

    // Verify remote has all 3 in kv
    expect(mockStore.tables.kv?.length).toBe(3);
    expect(mockStore.tables.kv.map((r) => r.key)).toEqual(["k1", "k2", "k3"]);

    adapter.close();
  });

  it("B7: verifies rolled-back local transactions do not emit statements to remote", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");

    const adapter = await createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" });

    expect(() => {
      adapter.transaction(() => {
        adapter.run("INSERT INTO kv(scope, key, value) VALUES (?, ?, ?)", ["test", "rollback-key", "val"]);
        throw new Error("Simulated transaction failure");
      });
    }).toThrow("Simulated transaction failure");

    await adapter.flush();

    // Local has 0 rows
    expect(local.get("SELECT COUNT(*) as c FROM kv WHERE key = 'rollback-key'").c).toBe(0);
    // Remote has 0 rows
    const remoteFound = (mockStore.tables.kv || []).find((r) => r.key === "rollback-key");
    expect(remoteFound).toBeUndefined();

    adapter.close();
  });

  it("B8: verifies duplicate or reordered upserts update in-place without corruption", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");

    const adapter = await createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" });

    // Initial insert
    adapter.run(
      "INSERT OR REPLACE INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      ["key-dup", "sk-version1", "Initial Name", "mach-1", 1, "2026-10-26T00:00:00Z"]
    );
    await adapter.flush();

    expect(adapter.get("SELECT name FROM apiKeys WHERE id = 'key-dup'").name).toBe("Initial Name");
    expect(mockStore.tables.apiKeys.find((r) => r.id === "key-dup").name).toBe("Initial Name");

    // Reordered/duplicate update with same ID
    adapter.run(
      "INSERT OR REPLACE INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      ["key-dup", "sk-version2", "Updated Name", "mach-1", 1, "2026-10-26T01:00:00Z"]
    );
    await adapter.flush();

    expect(adapter.get("SELECT name FROM apiKeys WHERE id = 'key-dup'").name).toBe("Updated Name");
    expect(adapter.get("SELECT COUNT(*) as c FROM apiKeys WHERE id = 'key-dup'").c).toBe(1);
    expect(mockStore.tables.apiKeys.filter((r) => r.id === "key-dup").length).toBe(1);
    expect(mockStore.tables.apiKeys.find((r) => r.id === "key-dup").name).toBe("Updated Name");

    adapter.close();
  });
});

