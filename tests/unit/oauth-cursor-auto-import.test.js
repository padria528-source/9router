import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fsPromises from "fs/promises";
import Module, { createRequire } from "node:module";

const testRequire = createRequire(import.meta.url);
const nativeModulePath = testRequire.resolve("better-sqlite3");
const originalNativeModule = testRequire.cache[nativeModulePath];

vi.mock("next/server", () => ({
  NextResponse: { json: (body, init) => ({ status: init?.status || 200, body }) },
}));
vi.mock("os", () => ({ default: { homedir: () => "/mock/home" }, homedir: () => "/mock/home" }));
vi.mock("fs/promises", () => ({ access: vi.fn(), constants: { R_OK: 4 } }));
const dbMock = vi.hoisted(() => ({ rows: {}, close: vi.fn(), failOpen: false, queries: [], cli: vi.fn() }));
// Never launch the real Cursor/sqlite3/which binaries from these unit tests.
vi.mock("child_process", () => ({ execFile: (...args) => dbMock.cli(...args) }));
const { GET } = await import("../../src/app/api/oauth/cursor/auto-import/route.js");

describe("GET /api/oauth/cursor/auto-import", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  const setPlatform = (value) => Object.defineProperty(process, "platform", { ...platformDescriptor, value });
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.rows = {};
    dbMock.queries = [];
    dbMock.failOpen = false;
    dbMock.cli.mockImplementation((_file, _args, _options, callback) => callback(new Error("CLI unavailable")));
    vi.mocked(fsPromises.access).mockResolvedValue();
    setPlatform("darwin");
    // The route loads optional native bindings through CommonJS require, not an ESM import.
    const nativeStub = new Module(nativeModulePath);
    nativeStub.loaded = true;
    nativeStub.exports = class {
        constructor(_path, options) {
          expect(options).toEqual({ readonly: true, fileMustExist: true });
          if (dbMock.failOpen) throw new Error("SQLITE_CANTOPEN");
        }
        prepare(sql) {
          expect(sql).toContain("WHERE key=?");
          return { get: (key) => {
            dbMock.queries.push(key);
            return key in dbMock.rows ? { value: dbMock.rows[key] } : undefined;
          } };
        }
        close() { dbMock.close(); }
    };
    testRequire.cache[nativeModulePath] = nativeStub;
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", platformDescriptor);
    if (originalNativeModule) testRequire.cache[nativeModulePath] = originalNativeModule;
    else delete testRequire.cache[nativeModulePath];
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reports both macOS candidate paths when no database is readable", async () => {
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    const { body } = await GET();
    expect(body.found).toBe(false);
    expect(body.error).toContain("Checked locations:");
    expect(body.error).toContain("Cursor - Insiders");
    expect(fsPromises.access).toHaveBeenCalledTimes(2);
    expect(dbMock.cli).not.toHaveBeenCalled();
  });
  it("offers manual import when both native and CLI database access fail", async () => {
    dbMock.failOpen = true;
    const { body } = await GET();
    expect(body).toMatchObject({ found: false, windowsManual: true });
    expect(body.dbPath).toContain("state.vscdb");
    expect(dbMock.cli).toHaveBeenCalled();
  });
  it("reads the exact keys using a read-only native database and closes it", async () => {
    dbMock.rows = { "cursorAuth/accessToken": "test-token", "storage.serviceMachineId": "test-machine-id" };
    expect((await GET()).body).toEqual({ found: true, accessToken: "test-token", machineId: "test-machine-id" });
    expect(dbMock.close).toHaveBeenCalledTimes(1);
    expect(dbMock.cli).not.toHaveBeenCalled();
  });
  it("unwraps JSON-encoded string values", async () => {
    dbMock.rows = { "cursorAuth/accessToken": '"json-token"', "storage.serviceMachineId": '"json-machine-id"' };
    expect((await GET()).body).toEqual({ found: true, accessToken: "json-token", machineId: "json-machine-id" });
  });
  it("tries documented alternative keys without fuzzy credential guessing", async () => {
    dbMock.rows = { "cursorAuth/token": "fallback-token", "telemetry.machineId": "fallback-machine" };
    expect((await GET()).body).toEqual({ found: true, accessToken: "fallback-token", machineId: "fallback-machine" });
    expect(dbMock.queries).toContain("cursorAuth/accessToken");
    expect(dbMock.queries).toContain("storage.serviceMachineId");
  });
  it("offers manual import when neither method finds both required fields", async () => {
    expect((await GET()).body).toMatchObject({ found: false, windowsManual: true });
    expect(dbMock.close).toHaveBeenCalledTimes(1);
  });
  it("uses sqlite3 CLI fallback when native bindings are unavailable", async () => {
    dbMock.failOpen = true;
    dbMock.cli.mockImplementation((file, args, _options, callback) => {
      expect(file).toBe("sqlite3");
      const value = args[1].includes("cursorAuth/accessToken") ? '"cli-token"' : '"cli-machine"';
      callback(null, { stdout: `${value}\n`, stderr: "" });
    });
    expect((await GET()).body).toEqual({ found: true, accessToken: "cli-token", machineId: "cli-machine" });
  });
  it("probes both Linux config locations before reporting missing Cursor data", async () => {
    setPlatform("linux");
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    const { body } = await GET();
    expect(body.found).toBe(false);
    expect(body.error).toContain("Checked locations:");
    expect(fsPromises.access).toHaveBeenCalledTimes(2);
    expect(dbMock.cli).not.toHaveBeenCalled();
  });
  it("refuses leftover Linux data when Cursor is not installed", async () => {
    setPlatform("linux");
    vi.mocked(fsPromises.access).mockImplementation(async (path) => {
      if (String(path).endsWith("cursor.desktop")) throw new Error("ENOENT");
    });
    const { body } = await GET();
    expect(body.found).toBe(false);
    expect(body.error).toContain("does not appear to be installed");
    expect(dbMock.close).not.toHaveBeenCalled();
  });
  it("probes Windows roaming and local alternatives using only mock paths", async () => {
    setPlatform("win32");
    vi.stubEnv("APPDATA", "/mock/roaming");
    vi.stubEnv("LOCALAPPDATA", "/mock/local");
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    const { body } = await GET();
    expect(body.found).toBe(false);
    expect(body.error.replace(/\\/g, "/")).toContain("/mock/roaming");
    expect(body.error.replace(/\\/g, "/")).toContain("/mock/local");
    expect(fsPromises.access).toHaveBeenCalledTimes(4);
  });
  it("uses Unix config probing for other Unix-like platforms", async () => {
    setPlatform("freebsd");
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.body.found).toBe(false);
    expect(response.body.error).toContain(".config");
  });
});
