// #4333: "Strict Proxy" did not hold. With a strict pool assigned and every
// proxy in it dead, requests still went out over the direct IP — the exact
// leak the setting exists to prevent.
//
// Two halves, one per layer:
//
// 1. resolveConnectionProxyConfig drops strictProxy whenever the pool is not
//    usable (inactive, or saved with an empty proxyUrl). isValidPool gates the
//    only two returns that carry strictProxy, so an unusable strict pool falls
//    through to the legacy/none branches, which report strictProxy:false.
//
// 2. proxyAwareFetch only honours strictProxy inside the catch of a proxy
//    attempt. When no proxy URL resolves there is nothing to try, so it
//    reaches the trailing `return originalFetch(url, options)` and connects
//    directly.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dnsResolve } = vi.hoisted(() => ({ dnsResolve: vi.fn() }));

vi.mock("@/models", () => ({
  getProxyPoolById: vi.fn(),
}));

// A regression must never reach a real resolver or socket from this suite.
vi.mock("dns", () => ({
  Resolver: class {
    setServers() {}
    resolve4(hostname, callback) {
      dnsResolve(hostname);
      callback(new Error("Unexpected DNS lookup in isolated proxy test"));
    }
  },
}));

const { getProxyPoolById } = await import("@/models");
const { resolveConnectionProxyConfig } = await import("../../src/lib/network/connectionProxy.js");
let proxyAwareFetch;
let fetchMock;

beforeEach(async () => {
  vi.resetModules();
  getProxyPoolById.mockReset();
  dnsResolve.mockClear();
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]) {
    vi.stubEnv(key, "");
  }
  fetchMock = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", fetchMock);
  ({ proxyAwareFetch } = await import("../../open-sse/utils/proxyFetch.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("strict pool keeps strictProxy when the pool is unusable (#4333)", () => {
  it("keeps strictProxy for an inactive strict pool", async () => {
    getProxyPoolById.mockResolvedValue({
      id: "p1", isActive: false, proxyUrl: "http://127.0.0.1:7890", strictProxy: true,
    });
    const cfg = await resolveConnectionProxyConfig({ proxyPoolId: "p1" });
    expect(cfg.strictProxy).toBe(true);
  });

  it("keeps strictProxy for a strict pool saved without a proxy url", async () => {
    getProxyPoolById.mockResolvedValue({
      id: "p2", isActive: true, proxyUrl: "", strictProxy: true,
    });
    const cfg = await resolveConnectionProxyConfig({ proxyPoolId: "p2" });
    expect(cfg.strictProxy).toBe(true);
  });

  it("still reports strictProxy:false for a non-strict pool", async () => {
    getProxyPoolById.mockResolvedValue({
      id: "p3", isActive: false, proxyUrl: "http://127.0.0.1:7890", strictProxy: false,
    });
    const cfg = await resolveConnectionProxyConfig({ proxyPoolId: "p3" });
    expect(cfg.strictProxy).toBe(false);
  });

  it("still reports strictProxy:false when no pool is assigned", async () => {
    const cfg = await resolveConnectionProxyConfig({});
    expect(cfg.strictProxy).toBe(false);
  });
});

describe("strictProxy refuses a direct connection (#4333)", () => {
  it("throws when a pool is assigned but no proxy url resolved", async () => {
    await expect(
      proxyAwareFetch("https://api.example.com/v1/chat", {}, { proxyPoolId: "p1", strictProxy: true }),
    ).rejects.toThrow(/strictProxy/);
  });

  it("throws when the pool is enabled but carries an empty url", async () => {
    await expect(
      proxyAwareFetch("https://api.example.com/v1/chat", {}, { enabled: true, url: "", strictProxy: true }),
    ).rejects.toThrow(/strictProxy/);
  });

  it("refuses a MITM-bypass host before DNS lookup or a direct connection", async () => {
    await expect(
      proxyAwareFetch("https://cloudcode-pa.googleapis.com/v1/chat", {}, { proxyPoolId: "p1", strictProxy: true }),
    ).rejects.toThrow(/strictProxy/);
    expect(dnsResolve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not block a caller that sets strictProxy with no proxy configured", async () => {
    // The Qoder executor passes strictProxy:true to mean "do not replay this
    // request directly if the proxy fails" — a replayed COSY signature gets a
    // 403. With nothing configured it must still reach the transport.
    const response = await proxyAwareFetch("https://api.example.com/v1/chat", {}, { strictProxy: true });
    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not block a request when strictProxy is off", async () => {
    const response = await proxyAwareFetch("https://api.example.com/v1/chat", {}, { strictProxy: false });
    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
