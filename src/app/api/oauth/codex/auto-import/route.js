import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { isHosted } from "@/shared/utils/deploymentMode";
import { createProviderConnection, getProviderConnections } from "@/models";
import { extractCodexAccountInfo } from "@/lib/oauth/providers";

/**
 * POST /api/oauth/codex/auto-import
 * Auto-imports Codex CLI credentials from ~/.codex/auth.json
 * Useful for local mode when the user logs in via `codex login --device-auth`.
 */
export async function POST() {
  try {
    if (isHosted()) {
      return NextResponse.json(
        {
          success: false,
          error: "Auto-import is local-only. On hosted deployments, please configure OPENAI_API_KEY on the server or paste your access token.",
        },
        { status: 400 }
      );
    }

    const authPath = path.join(os.homedir(), ".codex", "auth.json");

    let authData;
    try {
      const raw = await fs.readFile(authPath, "utf-8");
      authData = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "No Codex authentication file found at ~/.codex/auth.json. Please run 'codex login --device-auth' in your terminal first.",
        },
        { status: 404 }
      );
    }

    const tokens = authData.tokens || authData;
    const accessToken = tokens.access_token || tokens.accessToken;
    const refreshToken = tokens.refresh_token || tokens.refreshToken || null;
    const idToken = tokens.id_token || tokens.idToken || null;
    const apiKey = authData.OPENAI_API_KEY || null;

    if (!accessToken && !apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "No active credentials in ~/.codex/auth.json. Please run 'codex login --device-auth' to authenticate.",
        },
        { status: 400 }
      );
    }

    let email = null;
    let providerSpecificData = {
      authMethod: refreshToken ? "oauth" : accessToken ? "access_token" : "cli_api_key",
    };

    if (accessToken) {
      const info = extractCodexAccountInfo(idToken || accessToken);
      email = info.email || null;
      if (tokens.account_id || info.chatgptAccountId) {
        providerSpecificData.chatgptAccountId = tokens.account_id || info.chatgptAccountId;
      }
      if (info.chatgptPlanType) {
        providerSpecificData.chatgptPlanType = info.chatgptPlanType;
      }
    }

    const connection = await createProviderConnection({
      provider: "codex",
      authType: refreshToken ? "oauth" : "access_token",
      accessToken: accessToken || null,
      refreshToken,
      idToken,
      apiKey: !accessToken && apiKey ? apiKey : undefined,
      email,
      name: email ? `Codex (${email})` : "Codex CLI",
      providerSpecificData,
      testStatus: "active",
    });

    return NextResponse.json({
      success: true,
      message: "Successfully imported Codex credentials from local CLI",
      connection: {
        id: connection.id,
        provider: connection.provider,
        email: connection.email,
        name: connection.name,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to auto-import Codex credentials" },
      { status: 500 }
    );
  }
}
