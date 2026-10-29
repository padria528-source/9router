const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_NAME = "9router";

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return path.join(os.homedir(), `.${APP_NAME}`);
}

function getDataDir() {
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

  if (process.platform === "win32" && /^\//.test(configured)) {
    console.warn(`[DATA_DIR] '${configured}' is a Unix path on Windows -> fallback to default`);
    return defaultDir();
  }

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
    throw e;
  }
}

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");
try { fs.mkdirSync(MITM_DIR, { recursive: true }); } catch {}

module.exports = { DATA_DIR, MITM_DIR };
