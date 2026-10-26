import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";

const testsDir = fileURLToPath(new URL("../", import.meta.url));
// Verification must not silently create or update golden snapshots.
const dataRoot = process.env.NINE_ROUTER_TEST_DATA_ROOT || tmpdir();
mkdirSync(dataRoot, { recursive: true });
const resolvedRoot = realpathSync(dataRoot);
const isolatedDataDir = realpathSync(mkdtempSync(join(resolvedRoot, "9router-offline-")));
const testEnv = {
  ...process.env,
  CI: process.env.CI ?? "1",
  DATA_DIR: isolatedDataDir,
  DISABLE_BACKGROUND_TOKEN_REFRESH: "true",
};
// Offline tests must never mirror their synthetic rows to a configured remote DB.
delete testEnv.TURSO_DATABASE_URL;
delete testEnv.TURSO_AUTH_TOKEN;
console.log("Test DATA_DIR is isolated; existing application data and remote persistence are not used.");
const exclusions = [
  "**/real/**", "**/*.real.test.js", "**/*.live.test.js",
  "**/db-benchmark.test.js", "**/db-concurrent.test.js",
];
console.log("NOT RUN: live/real provider calls and DB benchmark/concurrency stress suites (offline verification).");
if (!existsSync(new URL("../../cloud/src/handlers/embeddings.js", import.meta.url))) {
  exclusions.push("**/embeddings.cloud.test.js");
  console.log("NOT RUN: optional cloud embeddings suite; cloud/src/handlers/embeddings.js is absent from this checkout.");
}

const vitest = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
  "run", "--reporter=verbose",
  ...exclusions.flatMap((pattern) => ["--exclude", pattern]),
  ...process.argv.slice(2),
], { cwd: testsDir, stdio: "inherit", env: testEnv });
const native = spawnSync(process.execPath, [
  "--loader", "./helpers/aliases-loader.mjs", "--test",
  "auth/saml.test.js", "unit/cline-auth.test.js",
  "unit/kimchi.test.js", "unit/kimchi-strip-reasoning.test.js",
], { cwd: testsDir, stdio: "inherit", env: testEnv });
if (vitest.error) console.error(vitest.error.message);
if (native.error) console.error(native.error.message);
process.exitCode = vitest.status === 0 && native.status === 0 ? 0 : 1;
const childPath = relative(resolvedRoot, isolatedDataDir);
if (childPath && !childPath.startsWith("..") && !isAbsolute(childPath)) {
  rmSync(isolatedDataDir, { recursive: true, force: true });
}
