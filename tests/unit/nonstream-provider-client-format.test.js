import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
}));

const { FORMATS } = await import("../../open-sse/translator/formats.js");
const { translateNonStreamingResponse, handleNonStreamingResponse } = await import("../../open-sse/handlers/chatCore/nonStreamingHandler.js");
const { handleForcedSSEToJson } = await import("../../open-sse/handlers/chatCore/sseToJsonHandler.js");

const geminiBody = () => ({
  responseId: "gemini-response", modelVersion: "gemini-test",
  candidates: [{
    content: { role: "model", parts: [
      { thought: true, text: "consider the question" },
      { text: "hello" },
      { functionCall: { id: "call-weather", name: "weather", args: { city: "Jakarta" } } },
    ] },
    finishReason: "STOP",
  }],
  usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, thoughtsTokenCount: 3,
    totalTokenCount: 28, cachedContentTokenCount: 4 },
});

function assertClaudeMessage(out, inputTokens = 16) {
  expect(out.type).toBe("message");
  expect(out).not.toHaveProperty("choices");
  expect(out).not.toHaveProperty("object");
  expect(out.content).toEqual([
    { type: "thinking", thinking: "consider the question" },
    { type: "text", text: "hello" },
    { type: "tool_use", id: "call-weather", name: "weather", input: { city: "Jakarta" } },
  ]);
  expect(out.stop_reason).toBe("tool_use");
  expect(out.usage).toEqual({ input_tokens: inputTokens, output_tokens: 8, cache_read_input_tokens: 4 });
}

function assertResponsesMessage(out, inputTokens = 20) {
  expect(out.object).toBe("response");
  expect(out).not.toHaveProperty("choices");
  expect(out.output).toEqual([
    { type: "reasoning", summary: [{ type: "summary_text", text: "consider the question" }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "hello", annotations: [] }] },
    { type: "function_call", id: "fc_call-weather", call_id: "call-weather", name: "weather", arguments: '{"city":"Jakarta"}' },
  ]);
  expect(out.status).toBe("completed");
  expect(out.usage).toEqual({ input_tokens: inputTokens, output_tokens: 8, total_tokens: inputTokens + 8,
    input_tokens_details: { cached_tokens: 4 }, output_tokens_details: { reasoning_tokens: 3 } });
}

describe("provider-native JSON follows the client's API envelope", () => {
  it.each([FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX])(
    "%s -> Claude preserves text, thinking, tool ids/arguments and token accounting", (format) => {
      const body = format === FORMATS.GEMINI ? geminiBody() : { response: geminiBody() };
      const before = structuredClone(body);
      assertClaudeMessage(translateNonStreamingResponse(body, format, FORMATS.CLAUDE));
      expect(body).toEqual(before);
    });

  it.each([FORMATS.GEMINI, FORMATS.GEMINI_CLI, FORMATS.ANTIGRAVITY, FORMATS.VERTEX])(
    "%s -> Responses preserves content, tools, reasoning and usage details", (format) => {
      const body = format === FORMATS.GEMINI ? geminiBody() : { response: geminiBody() };
      assertResponsesMessage(translateNonStreamingResponse(body, format, FORMATS.OPENAI_RESPONSES));
    });

  it("Claude -> Responses includes cached input exactly once", () => {
    const body = {
      id: "msg-test", type: "message", model: "claude-test", stop_reason: "tool_use",
      content: [{ type: "thinking", thinking: "reason" }, { type: "text", text: "answer" },
        { type: "tool_use", id: "tool-native", name: "read", input: { path: "note.md" } }],
      usage: { input_tokens: 16, output_tokens: 8, cache_read_input_tokens: 4, cache_creation_input_tokens: 2 },
    };
    const out = translateNonStreamingResponse(body, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES);
    expect(out.output.map(item => item.type)).toEqual(["reasoning", "message", "function_call"]);
    expect(out.output[2]).toMatchObject({ call_id: "tool-native", name: "read", arguments: '{"path":"note.md"}' });
    expect(out.usage).toEqual({ input_tokens: 22, output_tokens: 8, total_tokens: 30,
      input_tokens_details: { cached_tokens: 4, cache_creation_tokens: 2 } });
  });

  it.each([FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES])("Ollama -> %s preserves tools and thinking", (clientFormat) => {
    const body = { model: "ollama-test", done_reason: "tool_calls", prompt_eval_count: 20, eval_count: 8,
      message: { role: "assistant", content: "hello", thinking: "reason",
        tool_calls: [{ id: "call-native", function: { name: "read", arguments: { path: "note.md" } } }] } };
    const out = translateNonStreamingResponse(body, FORMATS.OLLAMA, clientFormat);
    if (clientFormat === FORMATS.CLAUDE) {
      expect(out.content).toEqual([{ type: "thinking", thinking: "reason" }, { type: "text", text: "hello" },
        { type: "tool_use", id: "call-native", name: "read", input: { path: "note.md" } }]);
      expect(out.usage).toEqual({ input_tokens: 20, output_tokens: 8 });
    } else {
      expect(out.output.map(item => item.type)).toEqual(["reasoning", "message", "function_call"]);
      expect(out.output[2]).toMatchObject({ call_id: "call-native", arguments: '{"path":"note.md"}' });
      expect(out.usage).toEqual({ input_tokens: 20, output_tokens: 8, total_tokens: 28 });
    }
  });

  it.each([FORMATS.GEMINI, FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES])(
    "%s native passthrough retains signatures and extra metadata unchanged", (format) => {
      const native = format === FORMATS.GEMINI ? geminiBody()
        : format === FORMATS.CLAUDE ? {
          id: "msg-native", type: "message", model: "claude-native", stop_reason: "end_turn",
          content: [{ type: "thinking", thinking: "native reasoning", signature: "fixture-signature" },
            { type: "text", text: "native answer" }],
          usage: { input_tokens: 20, output_tokens: 8, cache_read_input_tokens: 4 },
        } : {
          id: "resp-native", object: "response", status: "completed",
          output: [{ type: "reasoning", encrypted_content: "fixture-encrypted-reasoning" },
            { type: "message", content: [{ type: "output_text", text: "native answer" }] }],
          usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 },
        };
      native.nativeMetadata = { preserve: true };
      expect(translateNonStreamingResponse(native, format, format)).toBe(native);
    });

  it("maps token exhaustion to valid Claude and Responses stop/status values", () => {
    const body = geminiBody();
    body.candidates[0].content.parts = [{ text: "partial answer" }];
    body.candidates[0].finishReason = "MAX_TOKENS";
    const claude = translateNonStreamingResponse(body, FORMATS.GEMINI, FORMATS.CLAUDE);
    expect(claude.stop_reason).toBe("max_tokens");
    const responses = translateNonStreamingResponse(body, FORMATS.GEMINI, FORMATS.OPENAI_RESPONSES);
    expect(responses.status).toBe("incomplete");
    expect(responses.incomplete_details).toEqual({ reason: "max_output_tokens" });
  });
});

function handlerContext(sourceFormat, targetFormat, providerResponse, provider = "gemini") {
  return {
    providerResponse, provider, model: "test-model", sourceFormat, targetFormat,
    body: { messages: [], stream: false }, stream: false, requestStartTime: Date.now(),
    clientRawRequest: { endpoint: sourceFormat === FORMATS.CLAUDE ? "/v1/messages" : "/v1/responses" },
    trackDone: vi.fn(), appendLog: vi.fn(),
    reqLogger: { logProviderResponse: vi.fn(), logConvertedResponse: vi.fn() },
  };
}

describe("nonstream HTTP response sent to the client", () => {
  it.each([FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES])("Gemini HTTP JSON -> %s", async (sourceFormat) => {
    const context = handlerContext(sourceFormat, FORMATS.GEMINI,
      new Response(JSON.stringify(geminiBody()), { headers: { "content-type": "application/json" } }));
    const result = await handleNonStreamingResponse(context);
    expect(result.success).toBe(true);
    expect(result.response.headers.get("content-type")).toBe("application/json");
    const out = await result.response.json();
    if (sourceFormat === FORMATS.CLAUDE) assertClaudeMessage(out, 2016);
    else assertResponsesMessage(out, 2020);
  });
});

const chatSSE = () => [
  { id: "chatcmpl-test", choices: [{ delta: { reasoning_content: "consider the question", content: "hello" } }] },
  { choices: [{ delta: { tool_calls: [{ index: 0, id: "call-weather", function: { name: "weather", arguments: '{"city":' } }] } }] },
  { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Jakarta"}' } }] }, finish_reason: "tool_calls" }],
    usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28,
      prompt_tokens_details: { cached_tokens: 4 }, completion_tokens_details: { reasoning_tokens: 3 } } },
].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";

function responsesSSE() {
  const events = [
    ["response.created", { response: { id: "resp-test", created_at: 1700000000 } }],
    ["response.output_item.done", { output_index: 0, item: { type: "reasoning", summary: [{ type: "summary_text", text: "consider the question" }], encrypted_content: "fixture-encrypted-reasoning" } }],
    ["response.output_item.done", { output_index: 1, item: { type: "message", role: "assistant", content: [{ type: "output_text", text: "hello" }] } }],
    ["response.output_item.done", { output_index: 2, item: { type: "function_call", call_id: "call-weather", name: "weather", arguments: '{"city":"Jakarta"}' } }],
    ["response.output_item.done", { output_index: 3, item: { type: "custom_tool_call", call_id: "call-custom", name: "exec", input: "print('hello')" } }],
    ["response.completed", { response: { usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 } } }],
  ];
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

describe("forced streaming still returns the requested nonstream API envelope", () => {
  it.each([FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES])("chat SSE -> %s keeps thinking alongside text/tools", async (sourceFormat) => {
    const context = handlerContext(sourceFormat, FORMATS.OPENAI,
      new Response(chatSSE(), { headers: { "content-type": "text/event-stream" } }), "test-chat");
    const result = await handleForcedSSEToJson(context);
    expect(result.success).toBe(true);
    const out = await result.response.json();
    if (sourceFormat === FORMATS.CLAUDE) assertClaudeMessage(out);
    else assertResponsesMessage(out);
  });

  it("Codex Responses SSE -> Claude keeps reasoning, native/custom tools and usage", async () => {
    const context = handlerContext(FORMATS.CLAUDE, FORMATS.OPENAI_RESPONSES,
      new Response(responsesSSE(), { headers: { "content-type": "text/event-stream" } }), "codex");
    const result = await handleForcedSSEToJson(context);
    expect(result.success).toBe(true);
    const out = await result.response.json();
    expect(out.type).toBe("message");
    expect(out.content).toEqual([
      { type: "thinking", thinking: "consider the question" },
      { type: "text", text: "hello" },
      { type: "tool_use", id: "call-weather", name: "weather", input: { city: "Jakarta" } },
      { type: "tool_use", id: "call-custom", name: "exec", input: { input: "print('hello')" } },
    ]);
    expect(out.stop_reason).toBe("tool_use");
    expect(out.usage).toEqual({ input_tokens: 20, output_tokens: 8 });
  });

  it("Responses native SSE keeps encrypted reasoning and original output items", async () => {
    const context = handlerContext(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI_RESPONSES,
      new Response(responsesSSE(), { headers: { "content-type": "text/event-stream" } }), "codex");
    const result = await handleForcedSSEToJson(context);
    const out = await result.response.json();
    expect(out.object).toBe("response");
    expect(out.output[0].encrypted_content).toBe("fixture-encrypted-reasoning");
    expect(out.output[3]).toMatchObject({ type: "custom_tool_call", call_id: "call-custom", input: "print('hello')" });
    expect(out.usage).toEqual({ input_tokens: 20, output_tokens: 8, total_tokens: 28 });
  });
});
