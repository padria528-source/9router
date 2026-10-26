import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock handleChat
const mockHandleChat = vi.fn();
const { mockGetSettings, mockGetApiKeys, mockGetDashboardAuthSession } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockGetApiKeys: vi.fn(),
  mockGetDashboardAuthSession: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({
  getSettings: mockGetSettings,
  getApiKeys: mockGetApiKeys,
}));
vi.mock("@/lib/auth/dashboardSession.js", () => ({
  getDashboardAuthSession: mockGetDashboardAuthSession,
}));
vi.mock("@/sse/handlers/chat.js", () => ({
  handleChat: (...args) => mockHandleChat(...args),
}));

describe("POST /api/dashboard/chat/completions route", () => {
  beforeEach(() => {
    mockHandleChat.mockReset();
    mockGetSettings.mockReset().mockResolvedValue({ requireApiKey: false });
    mockGetApiKeys.mockReset().mockResolvedValue([]);
    mockGetDashboardAuthSession.mockReset().mockResolvedValue(null);
  });

  const modeBodies = [
    { mode: "single", model: "m1" },
    { mode: "council", memberModels: ["m1", "m2"], reviewerModel: "m1" },
    { mode: "debate", debaterA: "m1", debaterB: "m2", judgeModel: "m1", rounds: 1 },
  ];

  for (const body of modeBodies) {
    it(`preserves caller API authentication for every ${body.mode} completion`, async () => {
      const { POST } = await import("../../src/app/api/dashboard/chat/completions/route.js");
      mockHandleChat.mockImplementation(async (req) => {
        expect(req.headers.get("authorization")).toBe("Bearer fixture-caller-key");
        expect(req.headers.get("cookie")).toBeNull();
        return Response.json({ choices: [{ message: { content: "OK" } }] });
      });
      const res = await POST(new Request("http://localhost/api/dashboard/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer fixture-caller-key", cookie: "auth_token=fixture-session" },
        body: JSON.stringify({ ...body, messages: [{ role: "user", content: "Hello" }] }),
      }));
      expect(res.status).toBe(200);
      expect(mockHandleChat).toHaveBeenCalled();
      expect(mockGetApiKeys).not.toHaveBeenCalled();
    });

    it(`allows a verified dashboard session to run ${body.mode} with API auth required`, async () => {
      const { POST } = await import("../../src/app/api/dashboard/chat/completions/route.js");
      mockGetSettings.mockResolvedValue({ requireApiKey: true });
      mockGetDashboardAuthSession.mockResolvedValue({ authenticated: true });
      mockGetApiKeys.mockResolvedValue([
        { key: "fixture-inactive", isActive: false },
        { key: "fixture-active", isActive: true },
      ]);
      mockHandleChat.mockImplementation(async (req) => {
        expect(req.headers.get("authorization")).toBe("Bearer fixture-active");
        expect(req.headers.get("cookie")).toBeNull();
        return Response.json({ choices: [{ message: { content: "OK" } }] });
      });
      const res = await POST(new Request("http://localhost/api/dashboard/chat/completions", {
        method: "POST", headers: { cookie: "auth_token=fixture-session" },
        body: JSON.stringify({ ...body, messages: [{ role: "user", content: "Hello" }] }),
      }));
      expect(res.status).toBe(200);
      expect(mockGetDashboardAuthSession).toHaveBeenCalledWith("fixture-session");
      expect(mockHandleChat).toHaveBeenCalled();
    });
  }

  it("does not lend a server key to an unverified session", async () => {
    const { POST } = await import("../../src/app/api/dashboard/chat/completions/route.js");
    mockGetSettings.mockResolvedValue({ requireApiKey: true });
    const res = await POST(new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST", headers: { cookie: "auth_token=fixture-invalid" },
      body: JSON.stringify(modeBodies[0]),
    }));
    expect(res.status).toBe(401);
    expect(mockGetApiKeys).not.toHaveBeenCalled();
    expect(mockHandleChat).not.toHaveBeenCalled();
  });

  it("does not replace an invalid caller key with a server key", async () => {
    const { POST } = await import("../../src/app/api/dashboard/chat/completions/route.js");
    mockGetSettings.mockResolvedValue({ requireApiKey: true });
    mockHandleChat.mockResolvedValue(Response.json({ error: "Invalid API key" }, { status: 401 }));
    const res = await POST(new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST", headers: { authorization: "Bearer fixture-invalid" },
      body: JSON.stringify(modeBodies[0]),
    }));
    expect(res.status).toBe(401);
    expect(mockGetApiKeys).not.toHaveBeenCalled();
  });

  it("reports missing server configuration without issuing a key", async () => {
    const { POST } = await import("../../src/app/api/dashboard/chat/completions/route.js");
    mockGetSettings.mockResolvedValue({ requireApiKey: true });
    mockGetDashboardAuthSession.mockResolvedValue({ authenticated: true });
    const res = await POST(new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST", headers: { cookie: "auth_token=fixture-session" },
      body: JSON.stringify(modeBodies[0]),
    }));
    expect(res.status).toBe(503);
    expect(mockHandleChat).not.toHaveBeenCalled();
  });

  it("routes tunggal mode directly to handleChat", async () => {
    const { POST } = await import("../../src/app/api/dashboard/chat/completions/route.js");
    mockHandleChat.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "Tunggal response" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const request = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "tunggal",
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    expect(mockHandleChat).toHaveBeenCalledTimes(1);
  });

  it("orchestrates dewan mode via SSE stream or JSON", async () => {
    const { POST } = await import("../../src/app/api/dashboard/chat/completions/route.js");
    mockHandleChat.mockImplementation(async (req) => {
      const body = await req.json();
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: `Response for ${body.model}` } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const request = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "dewan",
        memberModels: ["m1", "m2"],
        reviewerModel: "m1",
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe("dewan");
    expect(data.success).toBe(true);
    expect(data.choices[0].message.content).toContain("Response for m1");
  });

  it("orchestrates debat mode and handles judge synthesis", async () => {
    const { POST } = await import("../../src/app/api/dashboard/chat/completions/route.js");
    mockHandleChat.mockImplementation(async (req) => {
      const body = await req.json();
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: `Debate turn from ${body.model}` } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const request = new Request("http://localhost/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "debat",
        debaterA: "model-a",
        debaterB: "model-b",
        judgeModel: "judge-model",
        rounds: 1,
        messages: [{ role: "user", content: "Debate" }],
        stream: false,
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe("debat");
    expect(data.success).toBe(true);
    expect(data.choices[0].message.content).toContain("Debate turn from judge-model");
  });
});
