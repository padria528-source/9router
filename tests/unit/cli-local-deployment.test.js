import { it, expect } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../../cli/cli.js", import.meta.url), "utf8");
const expression = source.match(/env: (\{\s*\.\.\.buildEnvWithRuntime\(process.env\)[\s\S]*?\n      \})/)[1];
it("CLI server env establishes local mode without overriding owner configuration", () => {
  const build = (env) => vm.runInNewContext(`(${expression})`, { process: { env }, buildEnvWithRuntime: e => e, port: 20128, host: "0.0.0.0" });
  expect(build({}).DEPLOYMENT_MODE).toBe("local");
  for (const mode of ["hosted", "typo", ""]) expect(build({ DEPLOYMENT_MODE: mode }).DEPLOYMENT_MODE).toBe(mode);
  expect(build({ BASE_URL: "https://public.example" }).BASE_URL).toBe("https://public.example");
  expect(build({ RAILWAY_SERVICE_ID: "synthetic" }).RAILWAY_SERVICE_ID).toBe("synthetic");
});
