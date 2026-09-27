import { sanitizeSecrets } from "open-sse/utils/error.js";

export const AGENT_STATUS = {
  WAITING: "Menunggu",
  PROCESSING: "Memproses",
  COMPLETED: "Selesai",
  FAILED: "Gagal",
};

export const MAX_DEBATE_ROUNDS = 2;
export const MAX_CONTEXT_CHARS_PER_DEBATER = 3500;

/**
 * Compact context truncation to prevent exponential token growth
 * between debate rounds and council synthesis.
 */
export function truncateForContext(text, maxChars = MAX_CONTEXT_CHARS_PER_DEBATER) {
  if (!text) return "";
  const str = String(text).trim();
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars).trim() + "\n\n[... Remaining content truncated for context control ...]";
}

/**
 * Helper to extract prompt text from message content (string or array).
 */
function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .filter(Boolean)
      .join(" ");
  }
  if (content && typeof content === "object") {
    return content.text || content.message || JSON.stringify(content);
  }
  return String(content || "");
}

/**
 * Single call wrapper ensuring secret redaction and error normalization.
 */
async function callChat(chatCompletionFn, params) {
  try {
    if (params.signal?.aborted) {
      return { success: false, error: "Aborted", aborted: true };
    }
    const result = await chatCompletionFn(params);
    if (params.signal?.aborted) {
      return { success: false, error: "Aborted", aborted: true };
    }
    if (result && result.success) {
      return { success: true, content: result.content || "" };
    }
    const rawError = result?.error || "Unknown model execution failure";
    return { success: false, error: sanitizeSecrets(rawError) };
  } catch (err) {
    if (err.name === "AbortError" || params.signal?.aborted) {
      return { success: false, error: "Aborted", aborted: true };
    }
    const errMsg = err?.message || String(err);
    return { success: false, error: sanitizeSecrets(errMsg) };
  }
}

/**
 * TUNGGAL Mode: One selected model answers normally.
 */
export async function executeSingle({
  model,
  messages,
  temperature = 0.7,
  maxTokens,
  signal,
  onEvent,
  chatCompletionFn,
}) {
  onEvent?.({
    stage: "single",
    model,
    status: AGENT_STATUS.PROCESSING,
    timestamp: Date.now(),
  });

  const res = await callChat(chatCompletionFn, {
    model,
    messages,
    temperature,
    maxTokens,
    signal,
  });

  if (res.aborted) {
    onEvent?.({
      stage: "single",
      model,
      status: AGENT_STATUS.FAILED,
      error: "Aborted",
      timestamp: Date.now(),
    });
    return { mode: "tunggal", model, success: false, aborted: true, content: "" };
  }

  if (!res.success) {
    onEvent?.({
      stage: "single",
      model,
      status: AGENT_STATUS.FAILED,
      error: res.error,
      timestamp: Date.now(),
    });
    return { mode: "tunggal", model, success: false, error: res.error, content: "" };
  }

  onEvent?.({
    stage: "single",
    model,
    status: AGENT_STATUS.COMPLETED,
    content: res.content,
    timestamp: Date.now(),
  });

  return {
    mode: "tunggal",
    model,
    success: true,
    content: res.content,
  };
}

/**
 * DEWAN Mode: Multiple independent models deliberate concurrently,
 * then a reviewer/synthesizer evaluates and provides the final answer.
 */
export async function executeCouncil({
  memberModels,
  reviewerModel,
  messages,
  temperature = 0.7,
  maxTokens,
  signal,
  onEvent,
  chatCompletionFn,
}) {
  const models = Array.from(new Set(memberModels || [])).filter(Boolean);
  if (models.length < 2) {
    return {
      mode: "dewan",
      success: false,
      error: "Dewan requires at least 2 distinct participating models.",
    };
  }

  const synthesizer = reviewerModel || models[0];
  const lastUserMessage = extractText(messages[messages.length - 1]?.content);

  // Notify initial state: all members Waiting
  for (const m of models) {
    onEvent?.({
      stage: "council_member",
      model: m,
      status: AGENT_STATUS.WAITING,
      timestamp: Date.now(),
    });
  }

  // Stage 1: Parallel Member Execution
  const memberPromises = models.map(async (m) => {
    onEvent?.({
      stage: "council_member",
      model: m,
      status: AGENT_STATUS.PROCESSING,
      timestamp: Date.now(),
    });

    const res = await callChat(chatCompletionFn, {
      model: m,
      messages,
      temperature,
      maxTokens,
      signal,
    });

    const status = res.success ? AGENT_STATUS.COMPLETED : AGENT_STATUS.FAILED;
    onEvent?.({
      stage: "council_member",
      model: m,
      status,
      content: res.content || "",
      error: res.error,
      timestamp: Date.now(),
    });

    return { model: m, ...res };
  });

  const memberResults = await Promise.all(memberPromises);

  if (signal?.aborted) {
    return { mode: "dewan", success: false, aborted: true, content: "" };
  }

  const successfulMembers = memberResults.filter((r) => r.success && r.content.trim());

  if (successfulMembers.length === 0) {
    return {
      mode: "dewan",
      success: false,
      error: "Semua anggota dewan gagal menghasilkan respons.",
      members: memberResults,
    };
  }

  // Stage 2: Synthesis / Reviewer
  onEvent?.({
    stage: "reviewer",
    model: synthesizer,
    status: AGENT_STATUS.PROCESSING,
    timestamp: Date.now(),
  });

  const memberContextText = successfulMembers
    .map((m, idx) => `--- [Anggota ${idx + 1}: ${m.model}] ---\n${truncateForContext(m.content)}`)
    .join("\n\n");

  const synthesisSystemPrompt =
    "You are the Reviewer and Synthesizer of an AI Council.\n" +
    "Your duty is to review the individual deliberations from council members and deliver a comprehensive, authoritative, and balanced Final Answer to the user.\n" +
    "- Emphasize points of agreement and strong consensus.\n" +
    "- Reconcile or clarify any discrepancies, conflicting advice, or contrasting viewpoints.\n" +
    "- Present a clear, direct, well-structured, and actionable resolution for the user.";

  const synthesisUserPrompt =
    `The user asked:\n"${lastUserMessage}"\n\n` +
    `The Council Members provided the following independent perspectives:\n\n` +
    `${memberContextText}\n\n` +
    `Synthesize these perspectives into a definitive, high-quality Final Answer for the user.`;

  const reviewerRes = await callChat(chatCompletionFn, {
    model: synthesizer,
    messages: [
      { role: "system", content: synthesisSystemPrompt },
      { role: "user", content: synthesisUserPrompt },
    ],
    temperature: 0.5,
    maxTokens,
    signal,
  });

  if (signal?.aborted) {
    return { mode: "dewan", success: false, aborted: true, content: "" };
  }

  // Graceful degradation if reviewer fails
  if (!reviewerRes.success) {
    onEvent?.({
      stage: "reviewer",
      model: synthesizer,
      status: AGENT_STATUS.FAILED,
      error: reviewerRes.error,
      timestamp: Date.now(),
    });

    const fallbackOutput =
      `[Catatan: Penyintesis dewan (${synthesizer}) mengalami kendala (${reviewerRes.error}). Menampilkan hasil analisis langsung dari anggota dewan:]\n\n` +
      successfulMembers[0].content;

    return {
      mode: "dewan",
      success: true,
      isFallback: true,
      content: fallbackOutput,
      members: memberResults,
      reviewer: reviewerRes,
    };
  }

  onEvent?.({
    stage: "reviewer",
    model: synthesizer,
    status: AGENT_STATUS.COMPLETED,
    content: reviewerRes.content,
    timestamp: Date.now(),
  });

  return {
    mode: "dewan",
    success: true,
    content: reviewerRes.content,
    members: memberResults,
    reviewer: reviewerRes,
  };
}

/**
 * DEBAT Mode: Structured multi-round debate between models
 * followed by judge ruling.
 */
export async function executeDebate({
  debaterA,
  debaterB,
  judgeModel,
  rounds = 2,
  messages,
  temperature = 0.7,
  maxTokens,
  signal,
  onEvent,
  chatCompletionFn,
}) {
  if (!debaterA || !debaterB) {
    return {
      mode: "debat",
      success: false,
      error: "Debat memerlukan dua model peserta (Debater A dan Debater B).",
    };
  }

  // Clamp rounds strictly between 1 and 2
  const maxRounds = Math.min(MAX_DEBATE_ROUNDS, Math.max(1, rounds));
  const judge = judgeModel || debaterA;
  const lastUserMessage = extractText(messages[messages.length - 1]?.content);

  // Round 1: Independent Initial Positions
  onEvent?.({ stage: "debate_round", round: 1, model: `${debaterA} vs ${debaterB}`, status: AGENT_STATUS.PROCESSING, timestamp: Date.now() });

  const r1PromptA = [
    { role: "system", content: "You are Debater A in an AI debate. Formulate a strong, well-reasoned initial position defending your core arguments." },
    { role: "user", content: lastUserMessage },
  ];
  const r1PromptB = [
    { role: "system", content: "You are Debater B in an AI debate. Formulate a strong, well-reasoned initial position defending your distinct viewpoint." },
    { role: "user", content: lastUserMessage },
  ];

  const [resA1, resB1] = await Promise.all([
    callChat(chatCompletionFn, { model: debaterA, round: 1, messages: r1PromptA, temperature, maxTokens, signal }),
    callChat(chatCompletionFn, { model: debaterB, round: 1, messages: r1PromptB, temperature, maxTokens, signal }),
  ]);

  if (signal?.aborted) {
    return { mode: "debat", success: false, aborted: true, content: "" };
  }

  if (!resA1.success && !resB1.success) {
    return {
      mode: "debat",
      success: false,
      error: `Kedua debater gagal di Putaran 1. A: ${resA1.error}; B: ${resB1.error}`,
      round1: [{ model: debaterA, ...resA1 }, { model: debaterB, ...resB1 }],
    };
  }

  let r2Results = [];
  let executedRounds = 1;

  // Round 2: Critique & Rebuttal (if rounds === 2 and both or at least one produced output)
  if (maxRounds >= 2 && resA1.success && resB1.success) {
    executedRounds = 2;
    onEvent?.({ stage: "debate_round", round: 2, model: `${debaterA} vs ${debaterB}`, status: AGENT_STATUS.PROCESSING, timestamp: Date.now() });

    const posATruncated = truncateForContext(resA1.content);
    const posBTruncated = truncateForContext(resB1.content);

    const r2PromptA = [
      {
        role: "system",
        content: "You are Debater A in an AI debate. Critique your opponent's arguments, defend your core points, and sharpen your stance.",
      },
      {
        role: "user",
        content:
          `=== ORIGINAL USER REQUEST ===\n${lastUserMessage}\n\n` +
          `=== YOUR PREVIOUS POSITION ===\n${posATruncated}\n\n` +
          `=== OPPONENT POSITION (Debater B: ${debaterB}) ===\n${posBTruncated}\n\n` +
          `Present your rebuttal and refined position.`,
      },
    ];

    const r2PromptB = [
      {
        role: "system",
        content: "You are Debater B in an AI debate. Critique your opponent's arguments, defend your core points, and sharpen your stance.",
      },
      {
        role: "user",
        content:
          `=== ORIGINAL USER REQUEST ===\n${lastUserMessage}\n\n` +
          `=== YOUR PREVIOUS POSITION ===\n${posBTruncated}\n\n` +
          `=== OPPONENT POSITION (Debater A: ${debaterA}) ===\n${posATruncated}\n\n` +
          `Present your rebuttal and refined position.`,
      },
    ];

    const [resA2, resB2] = await Promise.all([
      callChat(chatCompletionFn, { model: debaterA, round: 2, messages: r2PromptA, temperature, maxTokens, signal }),
      callChat(chatCompletionFn, { model: debaterB, round: 2, messages: r2PromptB, temperature, maxTokens, signal }),
    ]);

    if (signal?.aborted) {
      return { mode: "debat", success: false, aborted: true, content: "" };
    }

    r2Results = [{ model: debaterA, ...resA2 }, { model: debaterB, ...resB2 }];
  }

  // Judge / Finalizer Stage
  onEvent?.({ stage: "judge", model: judge, status: AGENT_STATUS.PROCESSING, timestamp: Date.now() });

  const finalContentA = r2Results[0]?.success ? r2Results[0].content : resA1.content;
  const finalContentB = r2Results[1]?.success ? r2Results[1].content : resB1.content;

  const judgeSystemPrompt =
    "You are the impartial Judge of an AI Debate.\n" +
    "Your duty is to critically evaluate both debaters' positions, identify logical strengths and fallacies, and deliver a definitive, standalone Final Answer to the user.";

  const judgeUserPrompt =
    `The user asked:\n"${lastUserMessage}"\n\n` +
    `Debater A (${debaterA}) argued:\n${truncateForContext(finalContentA)}\n\n` +
    `Debater B (${debaterB}) argued:\n${truncateForContext(finalContentB)}\n\n` +
    `Evaluate the arguments and provide the definitive Final Answer.`;

  const judgeRes = await callChat(chatCompletionFn, {
    model: judge,
    messages: [
      { role: "system", content: judgeSystemPrompt },
      { role: "user", content: judgeUserPrompt },
    ],
    temperature: 0.5,
    maxTokens,
    signal,
  });

  if (signal?.aborted) {
    return { mode: "debat", success: false, aborted: true, content: "" };
  }

  if (!judgeRes.success) {
    onEvent?.({ stage: "judge", model: judge, status: AGENT_STATUS.FAILED, error: judgeRes.error, timestamp: Date.now() });

    const fallbackContent =
      `[Catatan: Hakim debat (${judge}) mengalami kendala (${judgeRes.error}). Menampilkan kesimpulan argumen debat:]\n\n` +
      (finalContentA || finalContentB);

    return {
      mode: "debat",
      success: true,
      isFallback: true,
      content: fallbackContent,
      executedRounds,
      round1: [{ model: debaterA, ...resA1 }, { model: debaterB, ...resB1 }],
      round2: r2Results,
      judge: judgeRes,
    };
  }

  onEvent?.({ stage: "judge", model: judge, status: AGENT_STATUS.COMPLETED, content: judgeRes.content, timestamp: Date.now() });

  return {
    mode: "debat",
    success: true,
    content: judgeRes.content,
    executedRounds,
    round1: [{ model: debaterA, ...resA1 }, { model: debaterB, ...resB1 }],
    round2: r2Results,
    judge: judgeRes,
  };
}

/**
 * Resolves a stored model ID against available models.
 * If model is no longer available, cleanly falls back to default without throwing.
 */
export function resolveModelWithFallback(storedId, availableModelIds = [], fallbackId = null) {
  if (storedId && availableModelIds.includes(storedId)) {
    return { modelId: storedId, isFallback: false };
  }
  const chosen = fallbackId && availableModelIds.includes(fallbackId)
    ? fallbackId
    : (availableModelIds[0] || null);
  return { modelId: chosen, isFallback: true };
}

/**
 * Universal entry point for mode dispatch
 */
export async function executeMode(options) {
  const mode = String(options.mode || "tunggal").toLowerCase();
  switch (mode) {
    case "dewan":
    case "council":
      return await executeCouncil(options);
    case "debat":
    case "debate":
      return await executeDebate(options);
    case "tunggal":
    case "single":
    default:
      return await executeSingle(options);
  }
}
