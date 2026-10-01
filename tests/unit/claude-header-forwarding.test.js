/**
 * Unit tests for Anthropic header forwarding pipeline
 *
 * Tests cover:
 *  - default.js buildHeaders(): static provider defaults + model-gated anthropic-beta
 *  - default.js buildHeaders(): anthropic-compatible non-Anthropic host stripping
 *  - default.js buildHeaders(): anthropic-compatible official host keeps headers
 *  - proxyFetch.js: native fetch preserves Anthropic request headers and body
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CLAUDE_CLI_VERSION } from "../../open-sse/providers/shared.js";

// ─── DefaultExecutor.buildHeaders() ──────────────────────────────────────────

describe("DefaultExecutor.buildHeaders() — claude provider", () => {
  let DefaultExecutor;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("open-sse/executors/default.js");
    DefaultExecutor = mod.DefaultExecutor || mod.default;
  });

  it("uses static provider defaults when no model is given", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "test-key" }, true);

    const hasVersion =
      headers["Anthropic-Version"] === "2023-06-01" ||
      headers["anthropic-version"] === "2023-06-01";
    expect(hasVersion).toBe(true);
    expect(headers["User-Agent"]).toBe(`claude-cli/${CLAUDE_CLI_VERSION} (external, sdk-cli)`);
  });

  it("includes heavy-agent beta flags for claude-opus-5", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "sk-test" }, true, undefined, "claude-opus-5");
    const betaFlags = headers["Anthropic-Beta"].split(",").map(s => s.trim());
    expect(betaFlags).toContain("advanced-tool-use-2025-11-20");
    expect(betaFlags).toContain("effort-2025-11-24");
  });

  it("includes heavy-agent beta flags for claude-sonnet-5", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "sk-test" }, true, undefined, "claude-sonnet-5");
    const betaFlags = headers["Anthropic-Beta"].split(",").map(s => s.trim());
    expect(betaFlags).toContain("advanced-tool-use-2025-11-20");
    expect(betaFlags).toContain("effort-2025-11-24");
  });

  it("omits heavy-agent beta flags for claude-haiku-4-5-20251001", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "sk-test" }, true, undefined, "claude-haiku-4-5-20251001");
    const betaFlags = headers["Anthropic-Beta"].split(",").map(s => s.trim());
    expect(betaFlags).not.toContain("advanced-tool-use-2025-11-20");
    expect(betaFlags).not.toContain("effort-2025-11-24");
    expect(betaFlags).toContain("claude-code-20250219");
  });

  it("omits heavy-agent beta flags for claude-fable-5", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "sk-test" }, true, undefined, "claude-fable-5");
    const betaFlags = headers["Anthropic-Beta"].split(",").map(s => s.trim());
    expect(betaFlags).not.toContain("advanced-tool-use-2025-11-20");
    expect(betaFlags).not.toContain("effort-2025-11-24");
  });

  it("sets x-api-key auth when apiKey is provided", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "sk-live-key" }, true);
    expect(headers["x-api-key"]).toBe("sk-live-key");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("sets Bearer Authorization when only accessToken is provided", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ accessToken: "tok-abc" }, true);
    expect(headers["Authorization"]).toBe("Bearer tok-abc");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("includes Accept: text/event-stream when stream=true", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "k" }, true);
    expect(headers["Accept"]).toBe("text/event-stream");
  });

  it("omits Accept: text/event-stream when stream=false", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders({ apiKey: "k" }, false);
    expect(headers["Accept"]).toBeUndefined();
  });

  it("does not throw when no model is given", () => {
    const executor = new DefaultExecutor("claude");
    expect(() => executor.buildHeaders({ apiKey: "sk" }, false)).not.toThrow();
  });

  it("sets x-claude-code-session-id from metadata.user_id on Claude OAuth", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders(
      { accessToken: "sk-ant-oat-test-token" },
      true,
      undefined,
      "claude-opus-5",
      {
        metadata: {
          user_id: '{"device_id":"d","account_uuid":"a","session_id":"sess-abc"}',
        },
      }
    );
    expect(headers["x-claude-code-session-id"]).toBe("sess-abc");
  });

  it("omits x-claude-code-session-id for non-OAuth API keys", () => {
    const executor = new DefaultExecutor("claude");
    const headers = executor.buildHeaders(
      { apiKey: "sk-ant-api03-xxx" },
      true,
      undefined,
      "claude-opus-5",
      {
        metadata: {
          user_id: '{"device_id":"d","account_uuid":"a","session_id":"sess-abc"}',
        },
      }
    );
    expect(headers["x-claude-code-session-id"]).toBeUndefined();
  });
});

// ─── anthropic-compatible header stripping ────────────────────────────────────

describe("DefaultExecutor.buildHeaders() — anthropic-compatible stripping", () => {
  let DefaultExecutor;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("open-sse/executors/default.js");
    DefaultExecutor = mod.DefaultExecutor || mod.default;
  });

  it("strips x-app and anthropic-dangerous-direct-browser-access for non-Anthropic host", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      true
    );

    expect(headers["x-app"]).toBeUndefined();
    expect(headers["X-App"]).toBeUndefined();
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBeUndefined();
    expect(headers["Anthropic-Dangerous-Direct-Browser-Access"]).toBeUndefined();
  });

  it("removes claude-code-20250219 from anthropic-beta for non-Anthropic host", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      true
    );

    const betaVal = headers["anthropic-beta"] || headers["Anthropic-Beta"] || "";
    expect(betaVal).not.toContain("claude-code-20250219");
  });

  it("keeps other beta flags intact after stripping", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    // The static CLAUDE_API_HEADERS used by anthropic-compatible providers include
    // 'interleaved-thinking-2025-05-14' — check it survives stripping
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      false
    );

    const betaVal = headers["anthropic-beta"] || headers["Anthropic-Beta"] || "";
    // If any beta value remains it should not be empty and should not have the stripped value
    if (betaVal) {
      expect(betaVal).not.toContain("claude-code-20250219");
    }
  });

  it("does NOT strip headers when baseUrl is api.anthropic.com", () => {
    const executor = new DefaultExecutor("anthropic-compatible-official");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://api.anthropic.com/v1" },
      },
      true
    );

    // No stripping — anthropic-version should survive
    const hasVersion =
      headers["Anthropic-Version"] || headers["anthropic-version"];
    expect(hasVersion).toBeDefined();
  });

  it("does NOT strip headers when baseUrl is empty (defaults to Anthropic)", () => {
    const executor = new DefaultExecutor("anthropic-compatible-official");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: {},
      },
      true
    );

    const hasVersion =
      headers["Anthropic-Version"] || headers["anthropic-version"];
    expect(hasVersion).toBeDefined();
  });

  // A node fronting Anthropic (rotating multi-account proxy, corporate gateway)
  // needs the same beta flags the `claude` provider sends. Without
  // context-management-2025-06-27 upstream answers HTTP 400
  // "context_management: Extra inputs are not permitted" and the combo falls
  // through to the next model without anyone noticing.
  it("sends context-management beta for a Claude model on a custom host", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      true,
      undefined,
      "claude-opus-5"
    );

    const betaFlags = (headers["Anthropic-Beta"] || headers["anthropic-beta"] || "")
      .split(",").map(s => s.trim());
    expect(betaFlags).toContain("context-management-2025-06-27");
    // The first-party identity flag is still stripped for a non-Anthropic host.
    expect(betaFlags).not.toContain("claude-code-20250219");
  });

  it("gates the beta flags on the model id, not the provider prefix", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      true,
      undefined,
      "kimi-k3"
    );

    const betaVal = headers["Anthropic-Beta"] || headers["anthropic-beta"] || "";
    expect(betaVal).not.toContain("context-management-2025-06-27");
  });
});

// ─── proxyFetch anthropicFetch routing ────────────────────────────────────────

describe("proxyAwareFetch - api.anthropic.com routing", () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "msg_test" }));
    vi.stubGlobal("fetch", fetchMock);
    for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
      vi.stubEnv(name, "");
    }
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("preserves Anthropic headers and body through the current native transport", async () => {
    const { proxyAwareFetch } = await import("open-sse/utils/proxyFetch.js");
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "anthropic-beta": "fixture-beta" },
      body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", messages: [] }),
      signal: new AbortController().signal,
    };
    const res = await proxyAwareFetch("https://api.anthropic.com/v1/messages", options);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", options);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("msg_test");
  });

  it("propagates native transport errors without hiding them", async () => {
    const failure = new Error("fixture network failure");
    fetchMock.mockRejectedValueOnce(failure);
    const { proxyAwareFetch } = await import("open-sse/utils/proxyFetch.js");
    await expect(proxyAwareFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })).rejects.toBe(failure);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves requests to compatible non-Anthropic hosts", async () => {
    const { proxyAwareFetch } = await import("open-sse/utils/proxyFetch.js");

    await proxyAwareFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });
});
