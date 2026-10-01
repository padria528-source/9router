import { beforeEach, describe, expect, it, vi } from "vitest";

const { adapter, keys } = vi.hoisted(() => ({
  adapter: { all: vi.fn() },
  keys: ["fixture-team-prefix-one-tail", "fixture-team-prefix-two-tail"],
}));
vi.mock("../../src/lib/db/driver.js", () => ({ getAdapter: async () => adapter }));
vi.mock("../../src/lib/db/repos/connectionsRepo.js", () => ({ getProviderConnections: async () => [] }));
vi.mock("../../src/lib/db/repos/nodesRepo.js", () => ({ getProviderNodes: async () => [] }));
vi.mock("../../src/lib/db/repos/apiKeysRepo.js", () => ({
  getApiKeys: async () => keys.map((key, i) => ({ key, id: `fixture-${i}`, name: `Team ${i}` })),
}));
import { getUsageStats } from "../../src/lib/db/repos/usageRepo.js";

describe("usage statistics API key privacy", () => {
  beforeEach(() => { adapter.all.mockReset(); });

  for (const period of ["24h", "7d"]) {
    it(`redacts object keys and preserves distinct accounts in ${period} stats`, async () => {
      const timestamp = new Date().toISOString();
      const rows = keys.map((apiKey, i) => ({
        apiKey, timestamp, model: "fixture-model", provider: "fixture-provider", cost: i + 1,
        tokens: JSON.stringify({ prompt_tokens: i + 2, completion_tokens: 1 }),
      }));
      adapter.all.mockImplementation((sql) => {
        if (sql.includes("FROM usageDaily")) return [{ dateKey: timestamp.slice(0, 10), data: JSON.stringify({
          byProvider: { "fixture-provider": { requests: 2 } },
          byApiKey: Object.fromEntries(rows.map((row, i) => [
            `${row.apiKey}|${row.model}|${row.provider}`,
            { apiKey: row.apiKey, rawModel: row.model, provider: row.provider, requests: 1, cost: i + 1 },
          ])),
        }) }];
        if (sql.includes("apiKey")) return rows;
        return [];
      });
      const stats = await getUsageStats(period);
      const serialized = JSON.stringify(stats);
      for (const key of keys) expect(serialized).not.toContain(key);
      const entries = Object.values(stats.byApiKey);
      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => entry.cost).sort()).toEqual([1, 2]);
      expect(entries.every((entry) => entry.requests === 1)).toBe(true);
      expect(new Set(entries.map((entry) => entry.apiKeyMasked)).size).toBe(1);
      expect(Object.keys(stats.byApiKey).every((key) => /^api-key-[a-f0-9]{64}$/.test(key))).toBe(true);
      expect(entries.every((entry) => entry.lastUsed === timestamp)).toBe(true);
    });
  }
});
