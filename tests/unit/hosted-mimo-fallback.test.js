import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { getMimoAccountCookie, getMimoAccountUsage } from "../../open-sse/shared/mimoAccount.js";
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn(async () => { throw new Error("synthetic-secret"); }) }));
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("MiMo connection credentials", () => {
  it.each(["local", "hosted", ""])("never implicitly reads Desktop cookies in mode %s", async (mode) => {
    vi.stubEnv("DEPLOYMENT_MODE", mode);
    const read = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(await getMimoAccountCookie()).toBeNull();
    expect(await getMimoAccountUsage()).toEqual({ error: "no-session" });
    expect(read).not.toHaveBeenCalled();
  });
  it("exchanges supplied hosted credentials without touching the Desktop store", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    const read = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(console, "log").mockImplementation(() => {});
    proxyAwareFetch.mockResolvedValueOnce({
      text: async () => JSON.stringify({ code: 0, location: "https://account.xiaomi.com/synthetic", nonce: "123", ssecurity: "synthetic-signing" }),
      headers: { getSetCookie: () => [] },
    }).mockResolvedValueOnce({ status: 200, headers: { get: () => null, getSetCookie: () => ["serviceToken=synthetic-session; Path=/"] } });
    expect(await getMimoAccountCookie({ mimoPassToken: "synthetic-success-token" })).toBe("serviceToken=synthetic-session");
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps explicitly supplied hosted credentials but not error secrets in logs", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await getMimoAccountCookie({ mimoPassToken: "synthetic-pass-token" })).toBeNull();
    expect(proxyAwareFetch).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("synthetic-secret");
  });
});
