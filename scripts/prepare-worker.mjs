import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const wasmSource = resolve(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const publicDir = resolve(process.cwd(), "public");
const wasmDest = resolve(publicDir, "sql-wasm.wasm");

if (existsSync(wasmSource)) {
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
  copyFileSync(wasmSource, wasmDest);
  console.log("[prepare-worker] Copied sql-wasm.wasm to public/");
}
