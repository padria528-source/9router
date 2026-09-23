import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { getProviderConnections } from "@/models";
import { isHosted } from "@/shared/utils/deploymentMode";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/openai/status
 * Authentication diagnostics endpoint reporting only safe metadata.
 * Never exposes the actual token or API key.
 */
export async function GET() {
  try {
    let method = "none";
    let connected = false;
    let tokenPresent = false;

    // 1. Check Strategy A: Server-Side OpenAI API Key
    const envKey = process.env.OPENAI_API_KEY?.trim();
    if (envKey) {
      method = "api-key";
      connected = true;
      tokenPresent = true;
    } else {
      // Check database connections for provider "openai"
      try {
        const openaiConns = await getProviderConnections({ provider: "openai", isActive: true });
        const activeOpenai = openaiConns.find(c => c.isActive !== false && (c.apiKey || c.testStatus === "active"));
        if (activeOpenai) {
          method = "api-key";
          connected = true;
          tokenPresent = true;
        }
      } catch {}
    }

    // 2. Check Strategy B: Codex / ChatGPT Authentication
    if (!connected) {
      try {
        const codexConns = await getProviderConnections({ provider: "codex", isActive: true });
        const activeCodex = codexConns.find(
          c => c.isActive !== false && (c.accessToken || c.refreshToken || c.testStatus === "active")
        );
        if (activeCodex) {
          method = "codex";
          connected = true;
          tokenPresent = true;
        }
      } catch {}
    }

    // Check local Codex CLI credentials if not hosted and not connected yet
    if (!connected && !isHosted()) {
      try {
        const authPath = path.join(os.homedir(), ".codex", "auth.json");
        const raw = await fs.readFile(authPath, "utf-8");
        const authData = JSON.parse(raw);
        const tokens = authData.tokens || authData;
        if (tokens.access_token || tokens.accessToken || authData.OPENAI_API_KEY) {
          method = "codex";
          connected = true;
          tokenPresent = true;
        }
      } catch {}
    }

    return NextResponse.json({
      provider: "openai",
      method,
      connected,
      tokenPresent,
    });
  } catch (error) {
    return NextResponse.json(
      {
        provider: "openai",
        method: "none",
        connected: false,
        tokenPresent: false,
      },
      { status: 500 }
    );
  }
}
