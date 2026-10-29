import fs from "node:fs";
import path from "path";
import os from "os";

const APP_NAME = "9router";

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return path.join(os.homedir(), `.${APP_NAME}`);
}

export function getDataDir() {
  const explicit = process.env.NINE_ROUTER_DATA_DIR || process.env.ROUTER_DATA_DIR;
  if (explicit) {
    if (process.platform === "win32" && /^\//.test(explicit)) {
      console.warn(`[DATA_DIR] '${explicit}' is a Unix path on Windows -> fallback to default`);
      return defaultDir();
    }
    try {
      fs.mkdirSync(explicit, { recursive: true });
      return explicit;
    } catch (e) {
      if (e?.code === "EACCES" || e?.code === "EPERM") {
        console.warn(`[DATA_DIR] '${explicit}' not writable -> fallback to default`);
        return defaultDir();
      }
      return explicit;
    }
  }

  const configured = process.env.DATA_DIR;
  if (!configured) return defaultDir();

  // On Windows, ignore Unix-style absolute paths (e.g. /var/lib/...) that come
  // from a Linux-targeted .env or Docker config — they are not valid here.
  if (process.platform === "win32" && /^\//.test(configured)) {
    console.warn(`[DATA_DIR] '${configured}' is a Unix path on Windows -> fallback to default`);
    return defaultDir();
  }

  // On Windows, generic DATA_DIR environment variables are frequently set by other
  // applications (e.g. OpenWebUI). Unless DATA_DIR explicitly targets 9router, fallback
  // to the Windows user application directory (%APPDATA%\9router).
  if (process.platform === "win32" && !/9router/i.test(configured)) {
    console.warn(`[DATA_DIR] Generic DATA_DIR '${configured}' does not target 9router on Windows -> fallback to default ${defaultDir()}`);
    return defaultDir();
  }

  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") {
      console.warn(`[DATA_DIR] '${configured}' not writable -> fallback ~/.${APP_NAME}`);
      return defaultDir();
    }
    // Serverless/workerd runtime fallback
    return configured;
  }
}

export const DATA_DIR = getDataDir();
