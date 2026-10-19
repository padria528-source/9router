import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock @libsql/client/http to simulate Turso
const executedStatements = [];
const mockRemoteRows = {};
let mockMarker = null;

vi.mock("@libsql/client/http", () => ({
  createClient: vi.fn(() => ({
    execute: vi.fn(async (stmt) => {
      const sql = typeof stmt === "string" ? stmt : stmt.sql;
      const args = typeof stmt === "string" ? [] : (stmt.args || []);
      executedStatements.push({ sql, args });

      if (/SELECT value FROM _meta WHERE key =/i.test(sql)) {
        return { columns: ["value"], rows: mockMarker ? [[mockMarker]] : [] };
      }
      if (/INSERT INTO _meta/i.test(sql)) {
        mockMarker = args[1] || "ready";
        return { columns: [], rows: [] };
      }
      if (/SELECT COUNT\(\*\)/i.test(sql)) {
        return { columns: ["c"], rows: [[0]] };
      }
      if (/SELECT /i.test(sql)) {
        const tableName = sql.match(/FROM\s+([A-Za-z0-9_]+)/i)?.[1];
        const rows = mockRemoteRows[tableName] || [];
        return { columns: [], rows };
      }
      return { columns: [], rows: [] };
    }),
    batch: vi.fn(async (stmts, mode) => {
      for (const s of stmts) {
        executedStatements.push({ sql: s.sql, args: s.args, mode });
      }
      return [];
    }),
    close: vi.fn(),
  })),
}));

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-turso-test-"));
  process.env.DATA_DIR = tempDir;
  executedStatements.length = 0;
  mockMarker = null;
  for (const k of Object.keys(mockRemoteRows)) delete mockRemoteRows[k];
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

describe("Turso & Schema V2 Compatibility Verification", () => {
  it("verifies Turso ensureSchema creates tables with accessRestricted and accessAllow columns", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");

    const adapter = await createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" });
    expect(adapter.driver).toBe("turso-mirror");

    // ensureSchema must execute CREATE TABLE for apiKeys with new V2 columns
    const apiKeyTableSql = executedStatements.find((s) => /CREATE TABLE IF NOT EXISTS apiKeys/i.test(s.sql));
    expect(apiKeyTableSql).toBeDefined();
    expect(apiKeyTableSql.sql).toContain("accessRestricted");
    expect(apiKeyTableSql.sql).toContain("accessAllow");

    adapter.close();
  });

  it("mirrors write operations including V2 apiKeys columns to Turso client", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const local = await getAdapter();
    const { createTursoMirrorAdapter } = await import("@/lib/db/adapters/tursoMirrorAdapter.js");

    const adapter = await createTursoMirrorAdapter(local, { url: "http://turso.mock", authToken: "token" });

    // Insert key with V2 columns
    adapter.run(
      "INSERT OR REPLACE INTO apiKeys(id, key, name, machineId, isActive, createdAt, accessRestricted, accessAllow) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ["k-test", "sk-test", "Test Key", "mach-1", 1, new Date().toISOString(), 1, JSON.stringify(["claude-3-5-sonnet"])]
    );
    await adapter.flush();

    const insertCall = executedStatements.find((s) => /INSERT OR REPLACE INTO apiKeys/i.test(s.sql));
    expect(insertCall).toBeDefined();
    expect(insertCall.args).toContain("k-test");
    expect(insertCall.args).toContain(1); // accessRestricted
    expect(insertCall.args).toContain(JSON.stringify(["claude-3-5-sonnet"])); // accessAllow

    // Read back locally
    const read = adapter.get("SELECT * FROM apiKeys WHERE id = ?", ["k-test"]);
    expect(read.name).toBe("Test Key");
    expect(read.accessRestricted).toBe(1);

    adapter.close();
  });

  it("verifies schema migration idempotence and restart recovery", async () => {
    const db1 = await import("@/lib/db/index.js");
    await db1.createApiKey("key-persist", "machine-id");

    const keysBefore = await db1.getApiKeys();
    expect(keysBefore.length).toBe(1);

    // Simulate server restart (reset adapter cache and reload modules)
    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    vi.resetModules();

    const db2 = await import("@/lib/db/index.js");
    const keysAfter = await db2.getApiKeys();
    expect(keysAfter.length).toBe(1);
    expect(keysAfter[0].name).toBe("key-persist");
    expect(keysAfter[0].access).toEqual({ restricted: false, allow: [] });
  });
});
