import { GET as getOpenAiStatus } from "../openai/status/route";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return getOpenAiStatus(request);
}

