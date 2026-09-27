import { handleChat } from "@/sse/handlers/chat.js";
import { executeMode } from "@/modes/orchestrator.js";

/**
 * Internal helper to run a completion using 9Router's full pipeline
 * (fallback, translation, retries, secrets scrubbing).
 */
async function internalChatCompletion({ model, messages, temperature, maxTokens, signal }) {
  const req = new Request("http://localhost:20128/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal,
  });

  const res = await handleChat(req);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData?.error?.message || errData?.message || `HTTP ${res.status}`;
    return { success: false, error: msg };
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || data?.output_text || "";
  return { success: true, content };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: { message: "Invalid JSON body" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mode = String(body.mode || "tunggal").toLowerCase();

  // Mode "tunggal" delegates directly to handleChat (supports standard SSE or JSON)
  if (mode === "tunggal" || mode === "single") {
    const forwardRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
      signal: request.signal,
    });
    return await handleChat(forwardRequest);
  }

  const isStream = Boolean(body.stream);

  // If streaming requested, return an SSE ReadableStream
  if (isStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Controller closed
          }
        };

        try {
          const result = await executeMode({
            ...body,
            signal: request.signal,
            onEvent: (ev) => sendEvent(ev),
            chatCompletionFn: internalChatCompletion,
          });

          // Final event with aggregated content
          sendEvent({
            stage: "complete",
            mode,
            success: result.success,
            content: result.content,
            details: result,
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          sendEvent({
            stage: "error",
            error: err?.message || String(err),
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming JSON response
  const result = await executeMode({
    ...body,
    signal: request.signal,
    chatCompletionFn: internalChatCompletion,
  });

  return new Response(
    JSON.stringify({
      id: `chatcmpl_${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      mode,
      success: result.success,
      isFallback: result.isFallback || false,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.content || result.error || "",
          },
          finish_reason: result.success ? "stop" : "error",
        },
      ],
      details: result,
    }),
    {
      status: result.success ? 200 : 502,
      headers: { "Content-Type": "application/json" },
    }
  );
}
