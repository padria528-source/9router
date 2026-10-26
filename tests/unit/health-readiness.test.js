import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9r-readiness-test-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try {
    global._dbAdapter?.instance?.close?.();
  } catch {}
  delete global._dbAdapter;
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  vi.clearAllMocks();
});

describe("Phase 3.7 — Database Readiness and Lifecycle Transition Qualification", () => {
  it("B1: Server baru boot dan database sedang inisialisasi -> HTTP 503 initializing", async () => {
    const { GET } = await import("@/app/api/health/route.js");

    // In-flight init promise
    let resolvePending;
    const pendingPromise = new Promise((resolve) => { resolvePending = resolve; });
    global._dbAdapter = {
      instance: null,
      initPromise: pendingPromise,
      initError: null,
      lastFailedAt: null,
      logged: false,
    };

    const res = await GET(new Request("http://localhost:20128/api/health"));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.ok).toBe(false);
    expect(data.status).toBe("initializing");

    resolvePending(null);
  });

  it("B2: Inisialisasi berhasil dan database siap digunakan -> HTTP 200 ready", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const { GET } = await import("@/app/api/health/route.js");

    const adapter = await getAdapter();
    expect(adapter).toBeDefined();

    const res = await GET(new Request("http://localhost:20128/api/health"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe("ready");
  });

  it("B3: Inisialisasi gagal sebelum adapter terbentuk -> HTTP 503 failed", async () => {
    const { GET } = await import("@/app/api/health/route.js");

    global._dbAdapter = {
      instance: null,
      initPromise: null,
      initError: new Error("Local SQLite creation failed"),
      lastFailedAt: Date.now(),
      logged: false,
    };

    const res = await GET(new Request("http://localhost:20128/api/health"));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.ok).toBe(false);
    expect(data.status).toBe("failed");
  });

  it("B4: Koneksi remote gagal saat bootstrap -> fails fast & HTTP 503 failed", async () => {
    process.env.TURSO_DATABASE_URL = "http://127.0.0.1:59999";
    process.env.TURSO_AUTH_TOKEN = "dummy-token";

    const { getAdapter } = await import("@/lib/db/driver.js");
    const { GET } = await import("@/app/api/health/route.js");

    await expect(getAdapter()).rejects.toThrow();

    const res = await GET(new Request("http://localhost:20128/api/health"));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.ok).toBe(false);
    expect(data.status).toBe("failed");

    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
  });

  it("B5: Kegagalan sementara diikuti pemulihan -> transisi dari failed ke ready", async () => {
    const { getAdapter, getDatabaseStatus } = await import("@/lib/db/driver.js");
    const { GET } = await import("@/app/api/health/route.js");

    // Simulasi kegagalan sementara pada attempt 1
    const transientErr = new Error("Network drop: 503 Service Unavailable");
    global._dbAdapter = {
      instance: null,
      initPromise: null,
      initError: transientErr,
      // lastFailedAt diset 2500ms yang lalu sehingga masa cooldown 2000ms sudah expired
      lastFailedAt: Date.now() - 2500,
      logged: false,
    };

    // Saat masih error, healthcheck melaporkan 503 failed
    const res1 = await GET(new Request("http://localhost:20128/api/health"));
    expect(res1.status).toBe(503);
    expect((await res1.json()).status).toBe("failed");

    // Sekarang jaringan pulih, request berikutnya memicu retry dan berhasil
    const adapter = await getAdapter();
    expect(adapter).toBeDefined();

    // Verifikasi status pulih menjadi HTTP 200 ready
    const status = getDatabaseStatus();
    expect(status.ready).toBe(true);
    expect(status.status).toBe("ready");

    const res2 = await GET(new Request("http://localhost:20128/api/health"));
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.ok).toBe(true);
    expect(data2.status).toBe("ready");
  });

  it("B6: Beberapa request readiness bersamaan saat startup -> konsisten dan non-blocking", async () => {
    const { GET } = await import("@/app/api/health/route.js");

    let count = 0;
    const slowPromise = new Promise((resolve) => {
      count++;
      setTimeout(() => resolve(null), 50);
    });

    global._dbAdapter = {
      instance: null,
      initPromise: slowPromise,
      initError: null,
      lastFailedAt: null,
      logged: false,
    };

    // 15 probe bersamaan
    const results = await Promise.all(
      Array.from({ length: 15 }, () => GET(new Request("http://localhost:20128/api/health")))
    );

    for (const res of results) {
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.status).toBe("initializing");
    }

    expect(count).toBe(1);
  });

  it("B7: Probe berulang tidak membuat bootstrap duplikat", async () => {
    const { GET } = await import("@/app/api/health/route.js");

    // Kondisi uninitialized
    for (let i = 0; i < 5; i++) {
      const res = await GET(new Request("http://localhost:20128/api/health"));
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.status).toBe("uninitialized");
    }

    // DB tetap uninitialized, tidak ada initPromise yang terbuat
    expect(global._dbAdapter?.initPromise).toBeFalsy();
  });

  it("B8: ?probe=liveness tetap menjawab berdasarkan kondisi proses tanpa mensyaratkan DB siap", async () => {
    const { GET } = await import("@/app/api/health/route.js");

    // Database dalam kondisi failed
    global._dbAdapter = {
      instance: null,
      initPromise: null,
      initError: new Error("Fatal DB outage"),
      lastFailedAt: Date.now(),
      logged: false,
    };

    // Liveness probe tetap mengembalikan HTTP 200 { ok: true, status: 'live' }
    const res = await GET(new Request("http://localhost:20128/api/health?probe=liveness"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe("live");
  });

  it("B9: Readiness tidak menginisialisasi atau memutasi database", async () => {
    const { GET } = await import("@/app/api/health/route.js");

    const res = await GET(new Request("http://localhost:20128/api/health"));
    expect(res.status).toBe(503);

    // Pastikan tidak ada file database yang terbuat di disk
    const files = fs.readdirSync(tempDir);
    expect(files.filter((f) => f.endsWith(".sqlite"))).toHaveLength(0);
  });

  it("B10: Respons error tetap tersanitasi tanpa kebocoran exception atau kredensial", async () => {
    const { GET } = await import("@/app/api/health/route.js");

    global._dbAdapter = {
      instance: null,
      initPromise: null,
      initError: new Error("Credentials leaked: token=xyz_super_secret_token_12345 in postgres://user:pass@host:5432/db"),
      lastFailedAt: Date.now(),
      logged: false,
    };

    const res = await GET(new Request("http://localhost:20128/api/health"));
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(text).not.toContain("super_secret_token");
    expect(text).not.toContain("postgres://");
    expect(text).not.toContain("Error:");
    expect(text).toBe(JSON.stringify({ ok: false, status: "failed" }));
  });

  it("B11: Restart tidak menghasilkan duplikasi seed atau korupsi data", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");

    // Boot 1
    const adapter1 = await getAdapter();
    adapter1.run(
      "INSERT OR REPLACE INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      ["key-idempotent-test", "sk-test", "Key Test", "m1", 1, "2026-10-26T00:00:00Z"]
    );
    expect(adapter1.get("SELECT COUNT(*) as c FROM apiKeys WHERE id = 'key-idempotent-test'").c).toBe(1);

    // Simulasi restart server (tutup adapter lama, reset state)
    adapter1.close();
    delete global._dbAdapter;
    vi.resetModules();

    // Boot 2
    const { getAdapter: getAdapter2 } = await import("@/lib/db/driver.js");
    const adapter2 = await getAdapter2();

    // Pastikan row count tetap 1
    expect(adapter2.get("SELECT COUNT(*) as c FROM apiKeys WHERE id = 'key-idempotent-test'").c).toBe(1);
    expect(adapter2.get("SELECT name FROM apiKeys WHERE id = 'key-idempotent-test'").name).toBe("Key Test");

    adapter2.close();
  });
});
