import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const { connectMock } = vi.hoisted(() => ({ connectMock: vi.fn() }));
vi.mock("http2", () => ({ default: { connect: connectMock } }));

import {
  clearCursorModelCache,
  parseCursorUsableModels,
  resolveCursorModels,
} from "../../open-sse/services/cursorModels.js";

function mockHttp2Response(payload, status = 200) {
  const request = new EventEmitter();
  request.end = vi.fn(() => {
    queueMicrotask(() => {
      request.emit("response", { ":status": status });
      request.emit("data", Buffer.from(payload));
      request.emit("end");
    });
  });
  const client = new EventEmitter();
  client.request = vi.fn(() => request);
  client.close = vi.fn();
  connectMock.mockReturnValue(client);
  return { client, request };
}

function varint(value) {
  const bytes = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Uint8Array.from(bytes);
}

function field(fieldNumber, value) {
  return Uint8Array.from([(fieldNumber << 3) | 2, ...varint(value.length), ...value]);
}

function text(value) {
  return new TextEncoder().encode(value);
}

function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function model(id, name) {
  return field(1, concat(field(1, text(id)), field(4, text(name))));
}

describe("Cursor live model catalog", () => {
  beforeEach(() => {
    clearCursorModelCache();
    connectMock.mockReset();
    connectMock.mockImplementation(() => { throw new Error("Unexpected HTTP/2 request in isolated test"); });
  });

  afterEach(() => {
    clearCursorModelCache();
  });

  it("decodes the GetUsableModels protobuf response", () => {
    const payload = concat(
      model("default", "Auto"),
      model("gpt-5.3-codex", "GPT 5.3 Codex"),
      model("gpt-5.3-codex", "Duplicate"),
    );

    expect(parseCursorUsableModels(payload)).toEqual([
      { id: "default", name: "Auto" },
      { id: "gpt-5.3-codex", name: "GPT 5.3 Codex" },
    ]);
  });

  it("fetches the account-specific catalog and caches it", async () => {
    const payload = concat(model("claude-4.6-opus", "Claude 4.6 Opus"));
    const { client, request } = mockHttp2Response(payload);
    const credentials = {
      accessToken: "cursor-token",
      providerSpecificData: { machineId: "machine-id" },
    };

    await expect(resolveCursorModels(credentials)).resolves.toEqual({
      models: [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }],
    });
    await expect(resolveCursorModels(credentials)).resolves.toEqual({
      models: [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }],
    });

    expect(connectMock).toHaveBeenCalledExactlyOnceWith("https://agent.api5.cursor.sh");
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        ":method": "POST",
        ":path": "/agent.v1.AgentService/GetUsableModels",
        "content-type": "application/proto",
        accept: "application/proto",
      }),
    );
    expect(request.end).toHaveBeenCalledWith(undefined);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("fails open when the Cursor catalog request fails", async () => {
    mockHttp2Response(Buffer.from("no"), 403);

    await expect(resolveCursorModels({
      accessToken: "cursor-token",
      providerSpecificData: { machineId: "machine-id" },
    })).resolves.toBeNull();
  });
});
