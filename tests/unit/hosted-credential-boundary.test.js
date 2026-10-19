import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isHosted } from "../../src/shared/utils/deploymentMode.js";
import fs from "fs/promises";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(async () => ({ requireLogin: true })),
  verify: vi.fn(async () => true),
  next: Symbol("next"),
  readZed: vi.fn(async () => ({ found: false })),
}));
vi.mock("next/server", () => ({ NextResponse: {
  next: () => mocks.next,
  json: (body, init) => new Response(JSON.stringify(body), { status: init?.status || 200 }),
} }));
vi.mock("@/lib/localDb", () => ({ getSettings: mocks.settings, validateApiKey: vi.fn() }));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: async () => "synthetic-cli" }));
vi.mock("@/lib/auth/dashboardSession", () => ({ verifyDashboardAuthToken: mocks.verify }));
vi.mock("@/models", () => ({ getProviderConnections: async () => [], createProviderConnection: vi.fn() }));
vi.mock("@/lib/oauth/providers", () => ({ extractCodexAccountInfo: vi.fn() }));
vi.mock("@/lib/oauth/utils/zedCredentials", () => ({ readZedIdeCredentials: mocks.readZed }));
vi.mock("open-sse/shared/mimoAccount.js", () => ({ readDesktopPassToken: vi.fn() }));
import { proxy } from "../../src/dashboardGuard.js";
import { POST as codexImport } from "../../src/app/api/oauth/codex/auto-import/route.js";
import { GET as diagnostics } from "../../src/app/api/auth/openai/status/route.js";
import { GET as cursorImport } from "../../src/app/api/oauth/cursor/auto-import/route.js";
import { GET as kiroImport } from "../../src/app/api/oauth/kiro/auto-import/route.js";
import { GET as zedImport } from "../../src/app/api/oauth/zed/auto-import/route.js";
import { GET as mimoImport } from "../../src/app/api/oauth/xiaomi-mimo/auto-import/route.js";

function request(path, headers = {}) {
  return { headers: new Headers(headers), cookies: { get: () => ({ value: "synthetic-session" }) },
    nextUrl: { pathname: path }, url: `http://localhost${path}` };
}

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_MODE", "local");
  vi.stubEnv("BASE_URL", "http://localhost:20128");
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("RAILWAY_ENVIRONMENT_ID", "");
  vi.stubEnv("RAILWAY_PROJECT_ID", "");
  vi.stubEnv("RAILWAY_SERVICE_ID", "");
  vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NINEROUTER_PEER_TOKEN", "synthetic-peer");
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({ requireLogin: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const conflicts = [
  { DEPLOYMENT_MODE: "hosted" },
  { BASE_URL: "https://public.example" },
  { NEXT_PUBLIC_BASE_URL: "https://public.example" },
  { BASE_URL: "not-a-url" },
  { BASE_URL: "file://localhost/tmp" },
  { DEPLOYMENT_MODE: "typo" },
  { RAILWAY_ENVIRONMENT_ID: "synthetic-environment" },
  { RAILWAY_PROJECT_ID: "synthetic-project" },
  { RAILWAY_SERVICE_ID: "synthetic-service" },
  { RAILWAY_PUBLIC_DOMAIN: "public.example" },
];

describe("hosted boundary fails closed", () => {
  it.each(["/api/oauth/zed/start-proxy", "/api/oauth/zed/stop-proxy", "/api/oauth/zed/register-session", "/api/oauth/zed/poll-status", "/api/oauth/trae/ide-status", "/api/oauth/xiaomi-mimo/authorize", "/api/oauth/xiaomi-mimo/exchange"])("requires caller locality and authentication for %s", async (path) => {
    mocks.settings.mockResolvedValue({ requireLogin: false });
    expect((await proxy(request(path))).status).toBe(403);
    mocks.verify.mockResolvedValueOnce(false);
    expect((await proxy(request(path, { "x-9r-real-ip": "127.0.0.1", "x-9r-peer-token": "synthetic-peer" }))).status).toBe(403);
    expect(await proxy(request(path, { "x-9r-real-ip": "127.0.0.1", "x-9r-peer-token": "synthetic-peer" }))).toBe(mocks.next);
  });
  it.each(conflicts)("rejects conflicting or ambiguous config %j", async (config) => {
    for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
    expect(isHosted()).toBe(true);
    // Neither a valid dashboard session nor a machine CLI token grants hosted login permission.
    for (const path of ["/api/oauth/codex/authorize", "/api/oauth/codex/auto-import", "/api/oauth/xiaomi-mimo/auto-import"]) {
      expect((await proxy(request(path, { "x-9r-cli-token": "synthetic-cli" }))).status).toBe(403);
    }
  });
  it("denies desktop callbacks when no local configuration is established", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "");
    vi.stubEnv("BASE_URL", "");
    for (const path of ["/api/oauth/codex/authorize", "/api/oauth/zed/start-proxy", "/api/oauth/zed/register-session"]) {
      expect((await proxy(request(path, { "x-9r-cli-token": "synthetic-cli" }))).status).toBe(403);
    }
  });
  it("preserves authenticated local OAuth", async () => {
    expect(await proxy(request("/api/oauth/codex/authorize", { "x-9r-real-ip": "127.0.0.1", "x-9r-peer-token": "synthetic-peer" }))).toBe(mocks.next);
  });
  it.each(["codex", "cursor", "kiro", "zed", "xiaomi-mimo"])("requires a local caller for %s import even with valid session", async (provider) => {
    expect((await proxy(request(`/api/oauth/${provider}/auto-import`, { host: "localhost" }))).status).toBe(403);
    expect(await proxy(request(`/api/oauth/${provider}/auto-import`, {
      "x-9r-real-ip": "127.0.0.1", "x-9r-peer-token": "synthetic-peer",
    }))).toBe(mocks.next);
  });
  it("keeps unauthenticated local imports protected", async () => {
    mocks.verify.mockResolvedValueOnce(false);
    expect((await proxy(request("/api/oauth/codex/auto-import", {
      "x-9r-real-ip": "127.0.0.1", "x-9r-peer-token": "synthetic-peer",
    }))).status).toBe(403);
  });
  it.each([...conflicts, { DEPLOYMENT_MODE: "", BASE_URL: "" }])("never reads host credentials under denied config %j", async (config) => {
    for (const [key, value] of Object.entries(config)) vi.stubEnv(key, value);
    const read = vi.spyOn(fs, "readFile").mockRejectedValue(new Error("synthetic-secret-in-error"));
    const access = vi.spyOn(fs, "access").mockRejectedValue(new Error("synthetic-secret-in-error"));
    const readdir = vi.spyOn(fs, "readdir").mockRejectedValue(new Error("synthetic-secret-in-error"));
    for (const handler of [codexImport, cursorImport, kiroImport, zedImport, mimoImport]) {
      const res = await handler();
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await res.text()).not.toContain("synthetic-secret-in-error");
    }
    const res = await diagnostics();
    expect(await res.json()).toMatchObject({ connected: false, tokenPresent: false });
    expect(read).not.toHaveBeenCalled();
    expect(access).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
    expect(mocks.readZed).not.toHaveBeenCalled();
  });
  it("allows explicit local synthetic Codex diagnostics", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({ tokens: { access_token: "synthetic-local-token" } }));
    const res = await diagnostics();
    expect(await res.json()).toEqual({ provider: "openai", method: "codex", connected: true, tokenPresent: true });
  });
});
