import { FORMATS } from "../formats.js";
import { fromOpenAIFinish } from "./finishReason.js";
import { CLAUDE_BLOCK, MODEL_FALLBACK, RESPONSES_ITEM, ROLE } from "../schema/index.js";

function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function openAICompletionToClaudeMessage(responseBody) {
  if (!responseBody?.choices?.[0]) return responseBody;
  const choice = responseBody.choices[0];
  const message = choice.message || {};
  const content = [];

  const reasoning = message.reasoning_content || message.provider_specific_fields?.reasoning_content || "";
  if (reasoning) {
    content.push({ type: CLAUDE_BLOCK.THINKING, thinking: reasoning });
  }
  if (typeof message.content === "string" && message.content.length > 0) {
    content.push({ type: CLAUDE_BLOCK.TEXT, text: message.content });
  }
  for (const toolCall of message.tool_calls || []) {
    const fn = toolCall.function || {};
    content.push({
      type: CLAUDE_BLOCK.TOOL_USE,
      id: toolCall.id || `toolu_${Date.now()}_${content.length}`,
      name: fn.name || toolCall.name || "",
      input: parseToolArguments(fn.arguments || toolCall.arguments),
    });
  }
  if (content.length === 0) content.push({ type: CLAUDE_BLOCK.TEXT, text: "" });

  const usage = responseBody.usage || {};
  const cacheRead = usage.prompt_tokens_details?.cached_tokens || usage.cache_read_input_tokens || 0;
  const cacheCreate = usage.prompt_tokens_details?.cache_creation_tokens || usage.cache_creation_input_tokens || 0;
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  return {
    id: String(responseBody.id || `msg_${Date.now()}`).replace(/^chatcmpl-/, ""),
    type: RESPONSES_ITEM.MESSAGE,
    role: ROLE.ASSISTANT,
    model: responseBody.model || MODEL_FALLBACK,
    content,
    stop_reason: fromOpenAIFinish(message.tool_calls?.length ? "tool_calls" : choice.finish_reason, FORMATS.CLAUDE),
    stop_sequence: null,
    usage: {
      input_tokens: Math.max(0, promptTokens - cacheRead - cacheCreate),
      output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      ...(cacheRead > 0 && { cache_read_input_tokens: cacheRead }),
      ...(cacheCreate > 0 && { cache_creation_input_tokens: cacheCreate }),
    },
  };
}
