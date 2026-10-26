import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { agentMock, proxyAgentMock } = vi.hoisted(() => ({
  agentMock: vi.fn(function Agent(options) { this.options = options; }),
  proxyAgentMock: vi.fn(function ProxyAgent(options) { this.options = options; }),
}));

vi.mock("undici", () => ({ Agent: agentMock, ProxyAgent: proxyAgentMock }));

function certificateError(code = "SELF_SIGNED_CERT_IN_CHAIN") {
  return new TypeError("fetch failed", {
    cause: Object.assign(new Error("certificate rejected"), { code }),
  });
}

let proxyAwareFetch;
let fetchMock;
let warnMock;

beforeEach(async () => {
  vi.resetModules();
  agentMock.mockClear();
  proxyAgentMock.mockClear();
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "ALLOW_INSECURE_TLS", "STRICT_SSL"]) {
    vi.stubEnv(key, "");
  }
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  warnMock = vi.spyOn(console, "warn").mockImplementation(() => {});
  ({ proxyAwareFetch } = await import("../../open-sse/utils/proxyFetch.js"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("TLS certificate verification", () => {
  it.each(["SELF_SIGNED_CERT_IN_CHAIN", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"])(
    "does not retry %s without explicit opt-in",
    async (code) => {
      const error = certificateError(code);
      fetchMock.mockRejectedValueOnce(error).mockResolvedValueOnce(new Response("ok"));

      await expect(proxyAwareFetch("https://api.example.com/v1/chat")).rejects.toBe(error);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(agentMock).not.toHaveBeenCalled();
      expect(warnMock).not.toHaveBeenCalled();
    },
  );

  it.each(["false", "0"])("does not opt in for ALLOW_INSECURE_TLS=%s", async (value) => {
    vi.stubEnv("ALLOW_INSECURE_TLS", value);
    const error = certificateError();
    fetchMock.mockRejectedValue(error);

    await expect(proxyAwareFetch("https://api.example.com/v1/chat")).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(agentMock).not.toHaveBeenCalled();
  });

  it.each(["true", "1"])("allows one certificate fallback when ALLOW_INSECURE_TLS=%s", async (value) => {
    vi.stubEnv("ALLOW_INSECURE_TLS", value);
    const response = new Response("ok");
    fetchMock.mockRejectedValueOnce(certificateError()).mockResolvedValueOnce(response);

    await expect(proxyAwareFetch("https://api.example.com/v1/chat")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].dispatcher).toBeUndefined();
    expect(agentMock).toHaveBeenCalledExactlyOnceWith({ connect: { rejectUnauthorized: false } });
    expect(fetchMock.mock.calls[1][1].dispatcher).toBe(agentMock.mock.instances[0]);
  });

  it.each(["true", "1"])("STRICT_SSL=%s overrides the insecure opt-in", async (value) => {
    vi.stubEnv("ALLOW_INSECURE_TLS", "true");
    vi.stubEnv("STRICT_SSL", value);
    const error = certificateError();
    fetchMock.mockRejectedValue(error);

    await expect(proxyAwareFetch("https://api.example.com/v1/chat")).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(agentMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("logs only the origin, excluding URL userinfo, path, query, and fragment", async () => {
    vi.stubEnv("ALLOW_INSECURE_TLS", "true");
    fetchMock.mockRejectedValueOnce(certificateError()).mockResolvedValueOnce(new Response("ok"));

    await proxyAwareFetch("https://test-user:test-password@api.example.com:8443/private-path?api_key=test-value#private-fragment");

    expect(warnMock).toHaveBeenCalledExactlyOnceWith(
      "[ProxyFetch] TLS cert verification failed (SELF_SIGNED_CERT_IN_CHAIN), retrying with insecure TLS: https://api.example.com:8443",
    );
  });

  it("preserves the configured proxy for an opted-in TLS fallback", async () => {
    vi.stubEnv("ALLOW_INSECURE_TLS", "true");
    const response = new Response("ok");
    fetchMock.mockRejectedValueOnce(certificateError()).mockResolvedValueOnce(response);

    await expect(proxyAwareFetch("https://api.example.com/v1/chat", {}, {
      enabled: true,
      url: "http://proxy.example:3128",
      strictProxy: true,
    })).resolves.toBe(response);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(proxyAgentMock).toHaveBeenNthCalledWith(1, { uri: "http://proxy.example:3128" });
    expect(proxyAgentMock).toHaveBeenNthCalledWith(2, {
      uri: "http://proxy.example:3128",
      requestTls: { rejectUnauthorized: false },
    });
    expect(agentMock).not.toHaveBeenCalled();
  });

  it("does not retry other transport failures even when opted in", async () => {
    vi.stubEnv("ALLOW_INSECURE_TLS", "true");
    const error = new TypeError("connection reset", { cause: { code: "ECONNRESET" } });
    fetchMock.mockRejectedValue(error);

    await expect(proxyAwareFetch("https://api.example.com/v1/chat")).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(agentMock).not.toHaveBeenCalled();
  });

  it("does not replay a locked request body even when opted in", async () => {
    vi.stubEnv("ALLOW_INSECURE_TLS", "true");
    const body = new ReadableStream();
    const reader = body.getReader();
    const error = certificateError();
    fetchMock.mockRejectedValue(error);

    try {
      await expect(proxyAwareFetch("https://api.example.com/v1/chat", { method: "POST", body })).rejects.toBe(error);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(agentMock).not.toHaveBeenCalled();
    } finally {
      reader.releaseLock();
    }
  });
});
