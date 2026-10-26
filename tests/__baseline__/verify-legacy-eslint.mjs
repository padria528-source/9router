// Compare saved ESLint JSON reports, never alter config or refresh the baseline.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const baseline = JSON.parse(fs.readFileSync(new URL("./legacy-eslint-baseline.json", import.meta.url), "utf8"));
const [reportPath, rootArg] = process.argv.slice(2);
if (!reportPath) throw new Error("Usage: node tests/__baseline__/verify-legacy-eslint.mjs <eslint-report.json> [repository-root]");
const root = path.resolve(rootArg || fileURLToPath(new URL("../../", import.meta.url)));
const key = (d) => JSON.stringify([d.file, d.ruleId || null, d.severity, d.message]);
const count = (rows) => {
  const result = new Map();
  for (const row of rows) result.set(key(row), (result.get(key(row)) || 0) + 1);
  return result;
};
const introduced = (current, original) => [...count(current)].filter(([id, n]) => n > (count(original).get(id) || 0));
// Small runnable check: shifted locations are harmless; new errors/warnings and duplicate findings fail.
const fixture = { file: "fixture.js", ruleId: "fixture", severity: 2, message: "synthetic" };
assert.equal(introduced([{ ...fixture, line: 99 }], [{ ...fixture, line: 1 }]).length, 0);
assert.equal(introduced([{ ...fixture, severity: 1 }], [fixture]).length, 1);
assert.equal(introduced([fixture, fixture], [fixture]).length, 1);

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const diagnostics = report.flatMap((r) => r.messages.map((m) => ({
  ...m, file: path.relative(root, r.filePath).split(path.sep).join("/"),
})));
const added = introduced(diagnostics, baseline.diagnostics);
const errors = report.reduce((n, r) => n + r.errorCount, 0);
const warnings = report.reduce((n, r) => n + r.warningCount, 0);
console.log(JSON.stringify({ errors, warnings, introduced: added.length, globalLintPass: errors === 0 && warnings === 0 }));
if (added.length) console.error(JSON.stringify(added));
process.exitCode = added.length ? 1 : 0;
