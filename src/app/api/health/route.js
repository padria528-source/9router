import { NextResponse } from "next/server";
import { getDatabaseStatus } from "@/lib/db/driver.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function GET(request) {
  let probe = null;
  if (request?.url) {
    try {
      const url = new URL(request.url);
      probe = url.searchParams.get("probe");
    } catch {
      // Ignore URL parsing errors
    }
  }

  // Pure liveness probe: verifies process is running and responding to HTTP
  if (probe === "liveness" || probe === "live") {
    return NextResponse.json({ ok: true, status: "live" }, { headers: CORS_HEADERS });
  }

  // Readiness probe (default or probe=readiness): verifies database initialization succeeded
  const dbStatus = getDatabaseStatus();
  if (!dbStatus.ready) {
    return NextResponse.json(
      { ok: false, status: dbStatus.status },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    { ok: true, status: "ready" },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
