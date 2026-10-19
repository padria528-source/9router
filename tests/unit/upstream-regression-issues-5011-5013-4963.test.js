import { describe, it, expect } from "vitest";
import {
  applyFingerprintTools,
  concealFingerprintToolNames,
  OPENCODE_FINGERPRINT_TOOLS,
} from "open-sse/utils/opencodeFingerprint.js";

describe("Regression Gates: Upstream Issues #5011, #5013, #4963", () => {
  describe("GitHub #5011 — Windows OpenCode shell -> shell_client fix", () => {
    it("keeps Windows OpenCode shell tool without aliasing to shell_client", () => {
      const windowsShellTool = {
        type: "function",
        name: "shell",
        description: "Execute a shell command and return its output. Commands run on Windows using powershell.exe. Quote file paths containing spaces.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command string to execute" },
            workdir: { type: "string" },
            timeout: { type: "integer" },
          },
          required: ["command"],
        },
      };

      const body = { tools: [windowsShellTool] };
      const map = applyFingerprintTools(body, true);

      // Must NOT be renamed to shell_client
      expect(map.size).toBe(0);
      const names = body.tools.map((t) => t.name ?? t.function?.name);
      expect(names).toContain("shell");
      expect(names).not.toContain("shell_client");
      // And read should be appended since it was missing
      expect(names).toContain("read");
      expect(body.tools.filter((t) => (t.name ?? t.function?.name) === "shell")).toHaveLength(1);
    });

    it("still aliases an alien caller tool named shell that is NOT OpenCode", () => {
      const customShellTool = {
        type: "function",
        name: "shell",
        description: "My custom proprietary remote runner tool",
        parameters: {
          type: "object",
          properties: {
            script: { type: "string" },
          },
          required: ["script"],
        },
      };

      const body = { tools: [customShellTool] };
      const map = applyFingerprintTools(body, true);

      // Must be safely aliased so OpenCode fingerprint shell can be sent
      expect(map.size).toBe(1);
      expect(map.get("shell_client")).toBe("shell");
      const names = body.tools.map((t) => t.name ?? t.function?.name);
      expect(names).toContain("shell_client");
      expect(names).toContain("shell");
    });
  });

  describe("GitHub #5013 — Pi CLI existingProvider ReferenceError fix", () => {
    it("POST /api/cli-tools/pi-settings does not throw ReferenceError when existingProvider is undefined", async () => {
      const { POST } = await import("../../src/app/api/cli-tools/pi-settings/route.js");
      const req = new Request("http://localhost:20128/api/cli-tools/pi-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "http://127.0.0.1:20128",
          model: "openai/gpt-4o",
        }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("GitHub #4963 — quotaPingSchedule module availability", () => {
    it("can import and use quotaPingSchedule functions without packaging omission", async () => {
      const quotaScheduleMod = await import("../../src/shared/services/quotaPingSchedule.js");
      expect(quotaScheduleMod).toBeDefined();
      expect(typeof quotaScheduleMod.normalizePingSchedule).toBe("function");
      expect(typeof quotaScheduleMod.getScheduleSlots).toBe("function");
      expect(typeof quotaScheduleMod.getDuePingSlot).toBe("function");

      const quotaAutoPingMod = await import("../../src/shared/services/quotaAutoPing.js");
      expect(quotaAutoPingMod).toBeDefined();
      expect(typeof quotaAutoPingMod.startQuotaAutoPing).toBe("function");
      expect(typeof quotaAutoPingMod.stopQuotaAutoPing).toBe("function");
    });
  });
});
