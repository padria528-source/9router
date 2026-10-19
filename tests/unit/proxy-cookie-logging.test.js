import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashboardProxy: vi.fn(),
  isAuthenticated: vi.fn(),
  sessionFromRequest: vi.fn(),
  isAccountProxyPath: vi.fn(),
  isMimoTakeoverPath: vi.fn(),
  takeoverUpstreamPath: vi.fn(),
  proxyAccountRequest: vi.fn(),
  runTakeover: vi.fn(),
  attachSessionCookie: vi.fn(),
  originOf: vi.fn(),
}));
vi.mock("../../src/dashboardGuard", () => ({
  proxy: mocks.dashboardProxy,
  isAuthenticated: mocks.isAuthenticated,
}));
vi.mock("../../src/lib/mimoLoginSession", () => mocks);

import proxy from "../../src/proxy.js";

let logs;
function request(pathname, cookie = "") {
  return { headers: new Headers({ cookie }), nextUrl: { pathname } };
}
function expectNoSecrets(...secrets) {
  const captured = logs.join("\n");
  for (const secret of secrets) expect(captured).not.toContain(secret);
}

beforeEach(() => {
  vi.resetAllMocks();
  logs = [];
  for (const method of ["log", "warn", "error", "info", "debug"]) {
    vi.spyOn(console, method).mockImplementation((...args) => logs.push(args.join(" ")));
  }
  mocks.dashboardProxy.mockResolvedValue(new Response("denied", { status: 401 }));
  mocks.isAuthenticated.mockResolvedValue(false);
});
afterEach(() => vi.restoreAllMocks());

describe("proxy cookie log confidentiality", () => {
  it.each(["/pass/anomaly", "/fe/anomaly"])("logs presence only for %s", async (pathname) => {
    const cookie = "auth_token=synthetic-auth-secret; other=synthetic-other-secret";
    const response = await proxy(request(pathname, cookie));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("denied");
    expect(mocks.dashboardProxy).toHaveBeenCalledTimes(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("cookie present: true");
    expectNoSecrets(cookie, "synthetic-auth-secret", "synthetic-other-secret", "auth_token=");
  });

  it("logs false for an absent cookie without changing the response", async () => {
    const response = await proxy(request("/pass/anomaly"));
    expect(response.status).toBe(401);
    expect(logs[0]).toContain("cookie present: false");
  });

  it("rejects an unauthenticated session cookie and clears it without forwarding", async () => {
    const response = await proxy(request("/pass/anomaly", "9r_mimo_login=synthetic-session-secret"));
    expect(mocks.isAuthenticated).toHaveBeenCalledTimes(1);
    expect(mocks.sessionFromRequest).not.toHaveBeenCalled();
    expect(mocks.proxyAccountRequest).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("denied");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expectNoSecrets("synthetic-session-secret");
  });

  it("clears an undecodable authenticated cookie without logging its value", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.sessionFromRequest.mockReturnValue(null);
    const response = await proxy(request("/pass/anomaly", "9r_mimo_login=synthetic-invalid-secret"));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expectNoSecrets("synthetic-invalid-secret");
  });

  it("preserves authenticated account forwarding", async () => {
    const session = { upstreamBase: "https://fixture.invalid" };
    const upstream = new Response("upstream", { status: 202 });
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.sessionFromRequest.mockReturnValue(session);
    mocks.isAccountProxyPath.mockReturnValue(true);
    mocks.proxyAccountRequest.mockResolvedValue(upstream);
    mocks.attachSessionCookie.mockReturnValue(upstream);
    const req = request("/pass/forward", "9r_mimo_login=synthetic-valid-secret");
    expect(await proxy(req)).toBe(upstream);
    expect(mocks.proxyAccountRequest).toHaveBeenCalledWith(session, req, undefined);
    expect(mocks.dashboardProxy).not.toHaveBeenCalled();
    expectNoSecrets("synthetic-valid-secret");
  });

  it("does not log cookie content reflected in an upstream error", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.sessionFromRequest.mockReturnValue({});
    mocks.isAccountProxyPath.mockReturnValue(true);
    mocks.proxyAccountRequest.mockRejectedValue(new Error("cookie=synthetic-error-secret"));
    const response = await proxy(request("/pass/forward", "9r_mimo_login=synthetic-session-secret"));
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("mimo login proxy error");
    expect(logs).toHaveLength(1);
    expectNoSecrets("synthetic-error-secret", "synthetic-session-secret");
  });
});
