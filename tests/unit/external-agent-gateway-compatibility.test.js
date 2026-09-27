import { describe, it, expect } from "vitest";
import "../translator/registerAll.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { initState, translateRequest, translateResponse } from "../../open-sse/translator/index.js";
import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.js";
import { openaiToClaudeResponse } from "../../open-sse/translator/response/openai-to-claude.js";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";

describe("External Agent Gateway Compatibility", () => {
  describe("1. Hermes Agent (OpenAI Chat Completions Protocol)", () => {
    it("handles OpenAI-compatible chat completion payload with tools and streaming", () => {
      const hermesPayload = {
        model: "custom/gemini-3.8-flash",
        stream: true,
        messages: [
          { role: "system", content: "You are Hermes Agent." },
          { role: "user", content: "Calculate 12345 + 54321 using code execution." },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "execute_code",
              description: "Run python code",
              parameters: {
                type: "object",
                properties: { code: { type: "string" } },
                required: ["code"],
              },
            },
          },
        ],
        tool_choice: "auto",
      };

      const out = translateRequest(
        FORMATS.OPENAI,
        FORMATS.OPENAI,
        hermesPayload.model,
        hermesPayload,
        true,
        null,
        "openai"
      );

      expect(out.messages).toHaveLength(2);
      expect(out.messages[0].role).toBe("system");
      expect(out.tools).toHaveLength(1);
      expect(out.tools[0].function.name).toBe("execute_code");
      expect(out.tool_choice).toBe("auto");
    });

    it("streams OpenAI delta chunks and finish reasons for tool calling and final answers", () => {
      const state = initState(FORMATS.OPENAI);

      const chunkText = {
        id: "chatcmpl-hermes-1",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "HERMES" }, finish_reason: null }],
      };

      const resText = translateResponse(FORMATS.OPENAI, FORMATS.OPENAI, chunkText, state);
      expect(resText).toBeDefined();
      expect(resText[0].choices[0].delta.content).toBe("HERMES");

      const chunkStop = {
        id: "chatcmpl-hermes-1",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      };
      const resStop = translateResponse(FORMATS.OPENAI, FORMATS.OPENAI, chunkStop, state);
      expect(resStop[0].choices[0].finish_reason).toBe("stop");
    });
  });

  describe("2. Claude Code (Anthropic Messages API Protocol)", () => {
    it("translates Claude Code system prompt, tool definitions, and tool results to internal wire", () => {
      const claudePayload = {
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 4096,
        system: [
          { type: "text", text: "You are Claude Code.", cache_control: { type: "ephemeral" } },
        ],
        messages: [
          { role: "user", content: "Create hello.txt" },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_01A",
                name: "Write",
                input: { path: "hello.txt", content: "Hello 9Router" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_01A",
                content: "File written successfully",
              },
            ],
          },
        ],
        tools: [
          {
            name: "Write",
            description: "Writes a file to disk",
            input_schema: {
              type: "object",
              properties: { path: { type: "string" }, content: { type: "string" } },
              required: ["path", "content"],
            },
          },
        ],
      };

      const out = claudeToOpenAIRequest("claude-3-7-sonnet", claudePayload, true);

      // System message extracted
      const sysMsg = out.messages.find((m) => m.role === "system");
      expect(sysMsg).toBeDefined();
      expect(sysMsg.content).toContain("You are Claude Code.");

      // Tool call converted
      const assistantMsg = out.messages.find((m) => m.role === "assistant");
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.tool_calls).toBeDefined();
      expect(assistantMsg.tool_calls[0].function.name).toBe("Write");

      // Tool result converted to role 'tool'
      const toolResultMsg = out.messages.find((m) => m.role === "tool");
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg.tool_call_id).toBe("toolu_01A");
      expect(toolResultMsg.content).toContain("File written successfully");

      // Tool schema mapped to OpenAI tools format
      expect(out.tools).toBeDefined();
      expect(out.tools[0].type).toBe("function");
      expect(out.tools[0].function.name).toBe("Write");
    });

    it("translates OpenAI stream chunks into Claude SSE event sequence", () => {
      const state = initState(FORMATS.CLAUDE);

      // 1. Initial chunk emits message_start + content_block_start + content_block_delta
      const chunk1 = {
        id: "chatcmpl-cc-1",
        choices: [{ index: 0, delta: { role: "assistant", content: "CLAUDE" }, finish_reason: null }],
      };
      const events1 = openaiToClaudeResponse(chunk1, state);
      expect(Array.isArray(events1)).toBe(true);

      const types1 = events1.map((e) => e.type);
      expect(types1).toContain("message_start");
      expect(types1).toContain("content_block_start");
      expect(types1).toContain("content_block_delta");

      const deltaEvent = events1.find((e) => e.type === "content_block_delta");
      expect(deltaEvent.delta.text).toBe("CLAUDE");

      // 2. Final chunk emits content_block_stop + message_delta + message_stop
      const chunk2 = {
        id: "chatcmpl-cc-1",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 15, completion_tokens: 2, total_tokens: 17 },
      };
      const events2 = openaiToClaudeResponse(chunk2, state);
      const types2 = events2.map((e) => e.type);
      expect(types2).toContain("content_block_stop");
      expect(types2).toContain("message_delta");
      expect(types2).toContain("message_stop");

      const msgDelta = events2.find((e) => e.type === "message_delta");
      expect(msgDelta.delta.stop_reason).toBe("end_turn");
    });

    it("translates tool calling streaming into Claude tool_use content blocks", () => {
      const state = initState(FORMATS.CLAUDE);

      const toolChunk1 = {
        id: "chatcmpl-cc-tool",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_abc123",
                  type: "function",
                  function: { name: "Write", arguments: '{"path":' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
      const events1 = openaiToClaudeResponse(toolChunk1, state);
      const startBlock = events1.find((e) => e.type === "content_block_start");
      expect(startBlock.content_block.type).toBe("tool_use");
      expect(startBlock.content_block.name).toBe("Write");

      const toolChunk2 = {
        id: "chatcmpl-cc-tool",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      };
      const events2 = openaiToClaudeResponse(toolChunk2, state);
      const msgDelta = events2.find((e) => e.type === "message_delta");
      expect(msgDelta.delta.stop_reason).toBe("tool_use");
    });
  });

  describe("3. OpenAI Codex (OpenAI Responses API Protocol)", () => {
    it("translates Codex Responses API input items and tools to internal wire format", () => {
      const responsesPayload = {
        model: "gpt-6-astra",
        input: [
          { type: "message", role: "system", content: "You are Codex CLI." },
          { type: "message", role: "user", content: "Write a python file calc.py" },
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "exec_command",
            arguments: JSON.stringify({ cmd: "touch calc.py" }),
          },
          {
            type: "function_call_output",
            call_id: "call_1",
            output: "calc.py created",
          },
        ],
        tools: [
          {
            type: "function",
            name: "exec_command",
            description: "Execute a command in shell",
            parameters: {
              type: "object",
              properties: { cmd: { type: "string" } },
              required: ["cmd"],
            },
          },
        ],
      };

      const out = openaiResponsesToOpenAIRequest("gpt-6-astra", responsesPayload, true, null);

      expect(out.messages).toBeDefined();
      expect(out.messages[0].role).toBe("system");
      expect(out.messages[0].content).toBe("You are Codex CLI.");

      const assistantCall = out.messages.find((m) => m.role === "assistant");
      expect(assistantCall.tool_calls[0].function.name).toBe("exec_command");

      const toolOutput = out.messages.find((m) => m.role === "tool");
      expect(toolOutput.tool_call_id).toBe("call_1");
      expect(toolOutput.content).toBe("calc.py created");

      expect(out.tools[0].function.name).toBe("exec_command");
    });

    it("translates OpenAI stream chunks into Codex Responses API SSE events", () => {
      const state = initState(FORMATS.OPENAI_RESPONSES);

      // First chunk produces response.created + response.in_progress + output_item.added + content_part.added + output_text.delta
      const chunk1 = {
        id: "chatcmpl-codex-1",
        choices: [{ index: 0, delta: { role: "assistant", content: "CODEX" }, finish_reason: null }],
      };
      const events1 = openaiToOpenAIResponsesResponse(chunk1, state);
      expect(Array.isArray(events1)).toBe(true);

      const eventNames1 = events1.map((e) => e.event);
      expect(eventNames1).toContain("response.created");
      expect(eventNames1).toContain("response.in_progress");
      expect(eventNames1).toContain("response.output_item.added");
      expect(eventNames1).toContain("response.content_part.added");
      expect(eventNames1).toContain("response.output_text.delta");

      const textDelta = events1.find((e) => e.event === "response.output_text.delta");
      expect(textDelta.data.delta).toBe("CODEX");

      // Final chunk produces output_item.done + response.completed with usage
      const chunk2 = {
        id: "chatcmpl-codex-1",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      };
      const events2 = openaiToOpenAIResponsesResponse(chunk2, state);
      const eventNames2 = events2.map((e) => e.event);
      expect(eventNames2).toContain("response.output_item.done");
      expect(eventNames2).toContain("response.completed");

      const completed = events2.find((e) => e.event === "response.completed");
      expect(completed.data.response.status).toBe("completed");
      expect(completed.data.response.usage).toBeDefined();
      expect(completed.data.response.usage.input_tokens).toBe(20);
      expect(completed.data.response.usage.output_tokens).toBe(5);
    });

    it("translates OpenAI function_call chunk into Codex Responses function_call events", () => {
      const state = initState(FORMATS.OPENAI_RESPONSES);

      const funcChunk = {
        id: "chatcmpl-codex-func",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_fn_1",
                  type: "function",
                  function: { name: "exec_command", arguments: '{"cmd":"dir"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      };

      const events = openaiToOpenAIResponsesResponse(funcChunk, state);
      const eventNames = events.map((e) => e.event);

      expect(eventNames).toContain("response.output_item.added");
      expect(eventNames).toContain("response.function_call_arguments.delta");
      expect(eventNames).toContain("response.output_item.done");
      expect(eventNames).toContain("response.completed");

      const added = events.find((e) => e.event === "response.output_item.added");
      expect(added.data.item.type).toBe("function_call");
      expect(added.data.item.name).toBe("exec_command");
    });
  });
});
