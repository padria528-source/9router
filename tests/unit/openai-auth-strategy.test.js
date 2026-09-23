import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import codexProvider from "../../src/lib/oauth/providers/codex.js";

let mockConnections = [];

vi.mock("@/models", () => ({
  getProviderConnections: vi.fn(async (filter) => {
    if (filter?.provider) {
      return mockConnections.filter((c) => c.provider === filter.provider);
    }
    return mockConnections;
  }),
  createProviderConnection: vi.fn(async (data) => ({ id: "mock-conn-id", ...data })),
}));

import { GET as getDiagnostics } from "../../src/app/api/auth/openai/status/route.js";
import { POST as postAutoImport } from "../../src/app/api/oauth/codex/auto-import/route.js";

describe("OpenAI / Codex Authentication Strategy", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockConnections = [];
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("Codex OAuth Redirect URI Hardening", () => {
    it("strictly prevents custom Railway/hosted redirect URIs from being generated", () => {
      const railwayRedirect = "https://9router-production-880a.up.railway.app/callback";
      const authUrl = codexProvider.buildAuthUrl(
        codexProvider.config,
        railwayRedirect,
        "test-state-123",
        "test-challenge-456"
      );

      const parsed = new URL(authUrl);
      expect(parsed.origin).toBe("https://auth.openai.com");
      expect(parsed.pathname).toBe("/oauth/authorize");
      expect(parsed.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
      
      // Crucial: Must NEVER equal the custom Railway redirect URI
      expect(parsed.searchParams.get("redirect_uri")).not.toBe(railwayRedirect);
      // Must strictly use the supported local loopback URI
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    });

    it("allows standard localhost callback URI", () => {
      const loopbackUri = "http://localhost:1455/auth/callback";
      const authUrl = codexProvider.buildAuthUrl(
        codexProvider.config,
        loopbackUri,
        "test-state",
        "test-challenge"
      );

      const parsed = new URL(authUrl);
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    });
  });

  describe("Diagnostics Endpoint (Requirement 9)", () => {
    it("reports method: 'api-key', connected: true, tokenPresent: true when OPENAI_API_KEY is configured in env", async () => {
      process.env.OPENAI_API_KEY = "sk-test-secret-key-12345";

      const res = await getDiagnostics();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        provider: "openai",
        method: "api-key",
        connected: true,
        tokenPresent: true,
      });

      // Security requirement: never return the actual key or token
      const rawJson = JSON.stringify(data);
      expect(rawJson).not.toContain("sk-test-secret-key-12345");
      expect(data.apiKey).toBeUndefined();
      expect(data.token).toBeUndefined();
    });

    it("reports method: 'api-key' when database has active openai connection", async () => {
      mockConnections = [
        {
          id: "conn-openai-1",
          provider: "openai",
          authType: "apikey",
          apiKey: "sk-db-secret",
          isActive: true,
          testStatus: "active",
        },
      ];

      const res = await getDiagnostics();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        provider: "openai",
        method: "api-key",
        connected: true,
        tokenPresent: true,
      });
      expect(JSON.stringify(data)).not.toContain("sk-db-secret");
    });

    it("reports method: 'codex' when database has active codex OAuth connection", async () => {
      mockConnections = [
        {
          id: "conn-codex-1",
          provider: "codex",
          authType: "oauth",
          accessToken: "eyJ-mock-token",
          isActive: true,
          testStatus: "active",
        },
      ];

      const res = await getDiagnostics();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        provider: "openai",
        method: "codex",
        connected: true,
        tokenPresent: true,
      });
      expect(JSON.stringify(data)).not.toContain("eyJ-mock-token");
    });

    it("reports method: 'none', connected: false, tokenPresent: false when no credentials exist", async () => {
      process.env.DEPLOYMENT_MODE = "hosted";
      mockConnections = [];

      const res = await getDiagnostics();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        provider: "openai",
        method: "none",
        connected: false,
        tokenPresent: false,
      });
    });
  });

  describe("Codex Auto-Import Route in Hosted Mode", () => {
    it("rejects auto-import when running in hosted deployment mode", async () => {
      process.env.DEPLOYMENT_MODE = "hosted";

      const res = await postAutoImport();
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Auto-import is local-only");
    });
  });

  describe("Version Endpoint Metadata", () => {
    it("reports deploymentMode, openaiAuthMethod, and commit", async () => {
      const { GET: getVersion } = await import("../../src/app/api/version/route.js");
      process.env.GIT_COMMIT = "1234567890abcdef";
      process.env.DEPLOYMENT_MODE = "hosted";
      process.env.OPENAI_API_KEY = "sk-test-key";

      const res = await getVersion();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.commit).toBe("1234567");
      expect(data.deploymentMode).toBe("hosted");
      expect(data.openaiAuthMethod).toBe("api_key");
    });
  });
});

