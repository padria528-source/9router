import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeMode,
  executeSingle,
  executeCouncil,
  executeDebate,
  truncateForContext,
  AGENT_STATUS,
  MAX_DEBATE_ROUNDS,
} from "../../src/modes/orchestrator.js";

describe("Chat Modes Orchestration — Unit Tests", () => {
  let mockChatCompletion;

  beforeEach(() => {
    mockChatCompletion = vi.fn();
  });

  describe("truncateForContext & Token Control", () => {
    it("returns short text as is", () => {
      expect(truncateForContext("hello world", 100)).toBe("hello world");
    });

    it("truncates text exceeding maxChars with omission marker", () => {
      const longText = "a".repeat(200);
      const result = truncateForContext(longText, 50);
      expect(result.length).toBeLessThan(longText.length);
      expect(result).toContain("[... Remaining content truncated for context control ...]");
    });
  });

  describe("TUNGGAL Mode", () => {
    it("executes the selected single model", async () => {
      mockChatCompletion.mockResolvedValueOnce({
        success: true,
        content: "Single model answer",
      });

      const events = [];
      const res = await executeSingle({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Tell me a joke" }],
        onEvent: (ev) => events.push(ev),
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.success).toBe(true);
      expect(res.content).toBe("Single model answer");
      expect(mockChatCompletion).toHaveBeenCalledTimes(1);
      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "Tell me a joke" }],
        })
      );
      // Status events emitted
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: "single", status: AGENT_STATUS.PROCESSING }),
          expect.objectContaining({ stage: "single", status: AGENT_STATUS.COMPLETED }),
        ])
      );
    });

    it("normalizes single model failure without crashing", async () => {
      mockChatCompletion.mockResolvedValueOnce({
        success: false,
        error: "Provider quota exceeded",
      });

      const events = [];
      const res = await executeSingle({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        onEvent: (ev) => events.push(ev),
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Provider quota exceeded");
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: "single", status: AGENT_STATUS.FAILED }),
        ])
      );
    });
  });

  describe("DEWAN (Council) Mode", () => {
    it("successfully runs a 2-member council and synthesizes final answer", async () => {
      // Mock Member A, Member B, then Reviewer
      mockChatCompletion
        .mockImplementation(async ({ model }) => {
          if (model === "model-a") return { success: true, content: "Opinion from A" };
          if (model === "model-b") return { success: true, content: "Opinion from B" };
          if (model === "reviewer") return { success: true, content: "Synthesized council consensus" };
          return { success: false, error: "Unknown model" };
        });

      const events = [];
      const res = await executeCouncil({
        memberModels: ["model-a", "model-b"],
        reviewerModel: "reviewer",
        messages: [{ role: "user", content: "What is quantum computing?" }],
        onEvent: (ev) => events.push(ev),
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.success).toBe(true);
      expect(res.content).toBe("Synthesized council consensus");
      expect(mockChatCompletion).toHaveBeenCalledTimes(3);

      // Verify reviewer prompt received both member outputs
      const reviewerCall = mockChatCompletion.mock.calls.find((c) => c[0].model === "reviewer");
      expect(reviewerCall).toBeDefined();
      const reviewerMessages = reviewerCall[0].messages;
      const userSynthesisMsg = reviewerMessages[reviewerMessages.length - 1].content;
      expect(userSynthesisMsg).toContain("Opinion from A");
      expect(userSynthesisMsg).toContain("Opinion from B");
    });

    it("successfully runs a 3-member council", async () => {
      mockChatCompletion.mockImplementation(async ({ model }) => {
        if (model === "synth") return { success: true, content: "3-member synthesis" };
        return { success: true, content: `Perspective from ${model}` };
      });

      const res = await executeCouncil({
        memberModels: ["m1", "m2", "m3"],
        reviewerModel: "synth",
        messages: [{ role: "user", content: "Topic" }],
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.success).toBe(true);
      expect(res.content).toBe("3-member synthesis");
      expect(mockChatCompletion).toHaveBeenCalledTimes(4); // 3 members + 1 reviewer
    });

    it("executes council members in parallel", async () => {
      let activeCalls = 0;
      let maxActiveCalls = 0;

      mockChatCompletion.mockImplementation(async ({ model }) => {
        if (model === "synth") return { success: true, content: "Done" };
        activeCalls++;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        await new Promise((resolve) => setTimeout(resolve, 30));
        activeCalls--;
        return { success: true, content: `Content from ${model}` };
      });

      await executeCouncil({
        memberModels: ["p1", "p2", "p3"],
        reviewerModel: "synth",
        messages: [{ role: "user", content: "Topic" }],
        chatCompletionFn: mockChatCompletion,
      });

      // Member calls ran concurrently
      expect(maxActiveCalls).toBe(3);
    });

    it("tolerates one member failure and still synthesizes with surviving members", async () => {
      mockChatCompletion.mockImplementation(async ({ model }) => {
        if (model === "good-member") return { success: true, content: "Good advice" };
        if (model === "bad-member") return { success: false, error: "500 Internal Server Error" };
        if (model === "reviewer") return { success: true, content: "Synthesis from surviving member" };
        return { success: false, error: "Unknown" };
      });

      const res = await executeCouncil({
        memberModels: ["good-member", "bad-member"],
        reviewerModel: "reviewer",
        messages: [{ role: "user", content: "Topic" }],
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.success).toBe(true);
      expect(res.content).toBe("Synthesis from surviving member");
    });

    it("falls back to surviving member output if reviewer fails", async () => {
      mockChatCompletion.mockImplementation(async ({ model }) => {
        if (model === "member-1") return { success: true, content: "Draft from member 1" };
        if (model === "member-2") return { success: true, content: "Draft from member 2" };
        if (model === "reviewer") return { success: false, error: "Reviewer 429 Rate Limit" };
        return { success: false, error: "Unknown" };
      });

      const res = await executeCouncil({
        memberModels: ["member-1", "member-2"],
        reviewerModel: "reviewer",
        messages: [{ role: "user", content: "Topic" }],
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.success).toBe(true);
      // Fallback returns the best member draft with note
      expect(res.content).toContain("Draft from member 1");
      expect(res.isFallback).toBe(true);
    });

    it("respects cancellation during council parallel execution", async () => {
      const abortController = new AbortController();

      mockChatCompletion.mockImplementation(async ({ signal }) => {
        return new Promise((resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new Error("Aborted"));
          });
        });
      });

      const promise = executeCouncil({
        memberModels: ["m1", "m2"],
        reviewerModel: "synth",
        messages: [{ role: "user", content: "Topic" }],
        signal: abortController.signal,
        chatCompletionFn: mockChatCompletion,
      });

      abortController.abort();
      const res = await promise;
      expect(res.success).toBe(false);
      expect(res.aborted).toBe(true);
    });
  });

  describe("DEBAT (Debate) Mode", () => {
    it("ensures initial positions in Round 1 are independent", async () => {
      mockChatCompletion.mockImplementation(async ({ model, messages }) => {
        if (model === "debater-a") return { success: true, content: "Position of A" };
        if (model === "debater-b") return { success: true, content: "Position of B" };
        if (model === "judge") return { success: true, content: "Final Judge Ruling" };
        return { success: true, content: "Rebuttal" };
      });

      await executeDebate({
        debaterA: "debater-a",
        debaterB: "debater-b",
        judgeModel: "judge",
        rounds: 1,
        messages: [{ role: "user", content: "Rust vs Go" }],
        chatCompletionFn: mockChatCompletion,
      });

      // Round 1 calls must not contain opponent's output
      const callA = mockChatCompletion.mock.calls.find((c) => c[0].model === "debater-a");
      const callB = mockChatCompletion.mock.calls.find((c) => c[0].model === "debater-b");
      expect(callA[0].messages.map((m) => m.content).join(" ")).not.toContain("Position of B");
      expect(callB[0].messages.map((m) => m.content).join(" ")).not.toContain("Position of A");
    });

    it("provides opponent output during rebuttal in Round 2", async () => {
      mockChatCompletion.mockImplementation(async ({ model, round }) => {
        if (round === 1 && model === "debater-a") return { success: true, content: "Round 1 Argument A" };
        if (round === 1 && model === "debater-b") return { success: true, content: "Round 1 Argument B" };
        if (round === 2 && model === "debater-a") return { success: true, content: "Rebuttal A" };
        if (round === 2 && model === "debater-b") return { success: true, content: "Rebuttal B" };
        if (model === "judge") return { success: true, content: "Judged Outcome" };
        return { success: false, error: "Unexpected" };
      });

      await executeDebate({
        debaterA: "debater-a",
        debaterB: "debater-b",
        judgeModel: "judge",
        rounds: 2,
        messages: [{ role: "user", content: "Monolith vs Microservices" }],
        chatCompletionFn: mockChatCompletion,
      });

      // Round 2 calls
      const r2CallA = mockChatCompletion.mock.calls.find((c) => c[0].model === "debater-a" && c[0].round === 2);
      expect(r2CallA).toBeDefined();
      const r2AContent = r2CallA[0].messages.map((m) => m.content).join(" ");
      expect(r2AContent).toContain("Round 1 Argument B");
    });

    it("enforces hard maximum limit of 2 rounds", async () => {
      mockChatCompletion.mockResolvedValue({ success: true, content: "Text" });

      const res = await executeDebate({
        debaterA: "debater-a",
        debaterB: "debater-b",
        judgeModel: "judge",
        rounds: 5, // Attempting 5 rounds
        messages: [{ role: "user", content: "Prompt" }],
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.executedRounds).toBeLessThanOrEqual(MAX_DEBATE_ROUNDS);
    });

    it("executes judge/finalizer and returns final answer", async () => {
      mockChatCompletion.mockImplementation(async ({ model }) => {
        if (model === "judge") return { success: true, content: "Final Judgement: Debater A has better data." };
        return { success: true, content: "Debate point" };
      });

      const res = await executeDebate({
        debaterA: "debater-a",
        debaterB: "debater-b",
        judgeModel: "judge",
        rounds: 1,
        messages: [{ role: "user", content: "Evaluate" }],
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.success).toBe(true);
      expect(res.content).toContain("Final Judgement");
    });

    it("falls back gracefully if judge fails", async () => {
      mockChatCompletion.mockImplementation(async ({ model, round }) => {
        if (model === "judge") return { success: false, error: "Judge crashed" };
        return { success: true, content: `Solid argument from ${model}` };
      });

      const res = await executeDebate({
        debaterA: "debater-a",
        debaterB: "debater-b",
        judgeModel: "judge",
        rounds: 1,
        messages: [{ role: "user", content: "Evaluate" }],
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.success).toBe(true);
      expect(res.isFallback).toBe(true);
      expect(res.content).toContain("Solid argument from");
    });

    it("handles cancellation during debate", async () => {
      const abortController = new AbortController();

      mockChatCompletion.mockImplementation(async ({ signal }) => {
        return new Promise((resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new Error("Aborted"));
          });
        });
      });

      const promise = executeDebate({
        debaterA: "debater-a",
        debaterB: "debater-b",
        judgeModel: "judge",
        rounds: 2,
        messages: [{ role: "user", content: "Evaluate" }],
        signal: abortController.signal,
        chatCompletionFn: mockChatCompletion,
      });

      abortController.abort();
      const res = await promise;
      expect(res.success).toBe(false);
      expect(res.aborted).toBe(true);
    });
  });

  describe("GENERAL: Redaction & Backwards Compatibility", () => {
    it("redacts sensitive secrets from orchestration error messages", async () => {
      mockChatCompletion.mockResolvedValueOnce({
        success: false,
        error: "Request failed for key=sk-secretKey1234567890 with Bearer sk-ant-secretKey9876543210",
      });

      const res = await executeSingle({
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
        chatCompletionFn: mockChatCompletion,
      });

      expect(res.error).not.toContain("sk-secretKey1234567890");
      expect(res.error).not.toContain("sk-ant-secretKey9876543210");
      expect(res.error).toContain("[redacted");
    });

    it("routes through executeMode dynamically", async () => {
      mockChatCompletion.mockResolvedValue({ success: true, content: "Dynamic answer" });

      const singleRes = await executeMode({
        mode: "tunggal",
        model: "m1",
        messages: [{ role: "user", content: "Hi" }],
        chatCompletionFn: mockChatCompletion,
      });
      expect(singleRes.mode).toBe("tunggal");

      const councilRes = await executeMode({
        mode: "dewan",
        memberModels: ["m1", "m2"],
        reviewerModel: "m1",
        messages: [{ role: "user", content: "Hi" }],
        chatCompletionFn: mockChatCompletion,
      });
      expect(councilRes.mode).toBe("dewan");

      const debateRes = await executeMode({
        mode: "debat",
        debaterA: "m1",
        debaterB: "m2",
        judgeModel: "m1",
        rounds: 1,
        messages: [{ role: "user", content: "Hi" }],
        chatCompletionFn: mockChatCompletion,
      });
      expect(debateRes.mode).toBe("debat");
    });

    it("cleanly handles stale persisted model with fallback", async () => {
      const { resolveModelWithFallback } = await import("../../src/modes/orchestrator.js");
      const available = ["gpt-4o", "claude-3-5-sonnet"];

      // Valid model
      const valid = resolveModelWithFallback("gpt-4o", available, "gpt-4o");
      expect(valid.modelId).toBe("gpt-4o");
      expect(valid.isFallback).toBe(false);

      // Stale deleted model
      const stale = resolveModelWithFallback("stale-model-v1", available, "gpt-4o");
      expect(stale.modelId).toBe("gpt-4o");
      expect(stale.isFallback).toBe(true);

      // Stale with no fallbackId defaults to first available
      const firstFallback = resolveModelWithFallback("stale-model-v2", available);
      expect(firstFallback.modelId).toBe("gpt-4o");
      expect(firstFallback.isFallback).toBe(true);
    });
  });
});
