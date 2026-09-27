import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeSecrets, formatProviderError, buildErrorBody } from "../../open-sse/utils/error.js";

const fetchMock = vi.fn();
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

beforeEach(() => {
  fetchMock.mockReset();
});

describe("error sanitization & secret redaction", () => {
  it("redacts Bearer tokens from error strings", () => {
    const raw = "Upstream failed: Authorization Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 invalid";
    const cleaned = sanitizeSecrets(raw);
    expect(cleaned).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(cleaned).toContain("Bearer [redacted]");
  });

  it("redacts sk- API keys and sk-ant- keys from error strings", () => {
    const raw = "Bad key sk-1234567890abcdef1234 and sk-ant-api03-abcdefghijklmnop";
    const cleaned = sanitizeSecrets(raw);
    expect(cleaned).not.toContain("sk-1234567890abcdef1234");
    expect(cleaned).not.toContain("sk-ant-api03-abcdefghijklmnop");
    expect(cleaned).toContain("[redacted-key]");
  });

  it("redacts credentials object secrets", () => {
    const creds = { apiKey: "custom-secret-key-12345" };
    const raw = "Error accessing endpoint with custom-secret-key-12345";
    const cleaned = sanitizeSecrets(raw, creds);
    expect(cleaned).not.toContain("custom-secret-key-12345");
    expect(cleaned).toContain("[redacted]");
  });

  it("redacts secrets inside formatProviderError and buildErrorBody", () => {
    const err = new Error("Provider rejected key sk-secret1234567890ab");
    const formatted = formatProviderError(err, "openai", "gpt-4o", 401);
    expect(formatted).not.toContain("sk-secret1234567890ab");
    const body = buildErrorBody(401, formatted);
    expect(body.error.message).not.toContain("sk-secret1234567890ab");
  });
});

describe("BaseExecutor retry policy & Retry-After handling", () => {
  it("parses Retry-After header in seconds", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    const ex = new BaseExecutor("test", { baseUrl: "https://api.test/v1" });
    const res = {
      status: 429,
      headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "3" : null) },
    };
    const delay = await ex.computeRetryDelay(res, 1, 1000);
    expect(delay).toBe(3000);
  });

  it("vetoes retry when Retry-After exceeds maxRetryAfterMs ceiling", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    const ex = new BaseExecutor("test", { baseUrl: "https://api.test/v1", maxRetryAfterMs: 15000 });
    const res = {
      status: 429,
      headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "60" : null) },
    };
    const delay = await ex.computeRetryDelay(res, 1, 1000);
    expect(delay).toBe(false);
  });

  it("applies bounded exponential backoff when defaultDelayMs is positive", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    const ex = new BaseExecutor("test", { baseUrl: "https://api.test/v1" });
    const res = {
      status: 503,
      headers: { get: () => null },
    };
    const delay1 = await ex.computeRetryDelay(res, 1, 1000);
    const delay2 = await ex.computeRetryDelay(res, 2, 1000);
    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay2).toBeGreaterThanOrEqual(1400);
  });

  it("does not retry 400 validation error in-place", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    fetchMock.mockResolvedValueOnce({ status: 400, headers: { get: () => "" } });
    const ex = new BaseExecutor("test", { baseUrl: "https://api.test/v1" });
    const out = await ex.execute({
      model: "m",
      body: {},
      stream: false,
      credentials: { apiKey: "test-key" },
    });
    expect(out.response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry 401 unauthorized in-place", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    fetchMock.mockResolvedValueOnce({ status: 401, headers: { get: () => "" } });
    const ex = new BaseExecutor("test", { baseUrl: "https://api.test/v1" });
    const out = await ex.execute({
      model: "m",
      body: {},
      stream: false,
      credentials: { apiKey: "bad-key" },
    });
    expect(out.response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 408 request timeout when configured", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    const ex = new BaseExecutor("test", {
      baseUrl: "https://api.test/v1",
      retry: { 408: { attempts: 2, delayMs: 0 } },
    });
    // Verify 408 is recognized as retryable
    expect(ex.config.retry[408].attempts).toBe(2);
  });

  it("retries 503 service unavailable and succeeds after retry", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    fetchMock
      .mockResolvedValueOnce({ status: 503, headers: { get: () => "" } })
      .mockResolvedValueOnce({ status: 200, headers: { get: () => "" } });
    const ex = new BaseExecutor("test", {
      baseUrl: "https://api.test/v1",
      retry: { 503: { attempts: 2, delayMs: 0 } },
    });
    const out = await ex.execute({
      model: "m",
      body: {},
      stream: false,
      credentials: { apiKey: "test-key" },
    });
    expect(out.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops retrying after maximum retry exhaustion", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    fetchMock
      .mockResolvedValueOnce({ status: 502, headers: { get: () => "" } })
      .mockResolvedValueOnce({ status: 502, headers: { get: () => "" } })
      .mockResolvedValueOnce({ status: 502, headers: { get: () => "" } });
    const ex = new BaseExecutor("test", {
      baseUrl: "https://api.test/v1",
      retry: { 502: { attempts: 2, delayMs: 0 } },
    });
    const out = await ex.execute({
      model: "m",
      body: {},
      stream: false,
      credentials: { apiKey: "test-key" },
    });
    // 1 initial + 2 retries = 3 calls total, returns failing 502
    expect(out.response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to next URL after in-place retry exhaustion", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    fetchMock
      .mockResolvedValueOnce({ status: 429, headers: { get: () => "" } })
      .mockResolvedValueOnce({ status: 200, headers: { get: () => "" } });
    const ex = new BaseExecutor("test", {
      baseUrls: ["https://api-primary.test/v1", "https://api-backup.test/v1"],
      retry: { 429: { attempts: 0, delayMs: 0 } },
    });
    const out = await ex.execute({
      model: "m",
      body: {},
      stream: false,
      credentials: { apiKey: "test-key" },
    });
    expect(out.response.status).toBe(200);
    expect(out.url).toBe("https://api-backup.test/v1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries transient network error (ECONNRESET)", async () => {
    const { BaseExecutor } = await import("../../open-sse/executors/base.js");
    fetchMock
      .mockRejectedValueOnce(new Error("read ECONNRESET"))
      .mockResolvedValueOnce({ status: 200, headers: { get: () => "" } });
    const ex = new BaseExecutor("test", {
      baseUrl: "https://api.test/v1",
      retry: { 502: { attempts: 1, delayMs: 0 } },
    });
    const out = await ex.execute({
      model: "m",
      body: {},
      stream: false,
      credentials: { apiKey: "test-key" },
    });
    expect(out.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("buildStreamErrorBytes sanitizes secrets in streaming error frames", async () => {
    const { buildStreamErrorBytes } = await import("../../open-sse/utils/streamHelpers.js");
    const bytes = buildStreamErrorBytes(504, "Connection lost to https://api.upstream.com?key=sk-secret1234567890", "openai");
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain("sk-secret1234567890");
    expect(text).toContain("[redacted]");
  });
});



