import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock handleChat
const mockHandleChat = vi.fn();
vi.mock("@/sse/handlers/chat.js", () => ({
  handleChat: (...args) => mockHandleChat(...args),
}));

describe("POST /api/dashboard/chat/completions route", () => {
  beforeEach(() => {
    mockHandleChat.mockReset();
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
